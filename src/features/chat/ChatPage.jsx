import React, { useEffect, useMemo, useRef, useState } from "react";
import { Send, Plus, Users as UsersIcon } from "lucide-react";
import { Modal, Field, TextInput, Card } from "../../components/ui/primitives.jsx";
import { useQuery } from "../../hooks/useQuery.js";
import { useAuth } from "../../hooks/useAuth.jsx";
import { useToast } from "../../hooks/useToast.jsx";
import { listConversations, listMessages, sendMessage, startConversation, subscribeToMessages } from "../../api/chat.js";
import { listUsers } from "../../api/users.js";
import { errMsg } from "../../lib/format.js";

const AVATAR_COLORS = ["bg-indigo-500", "bg-teal-500", "bg-orange-500", "bg-purple-500", "bg-rose-500", "bg-blue-500"];
function colorFor(name) {
  if (!name) return AVATAR_COLORS[0];
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

function conversationLabel(convo, myId) {
  if (convo.is_group) return convo.name || "กลุ่มแชท";
  const other = convo.participants?.map((p) => p.user).find((u) => u?.id !== myId);
  return other?.name || "ผู้ใช้งาน";
}

function NewConversationModal({ onClose, onCreated }) {
  const { session } = useAuth();
  const toast = useToast();
  const { data: users } = useQuery(() => listUsers(), []);
  const [isGroup, setIsGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);

  function toggleUser(id) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : isGroup ? [...s, id] : [id]));
  }

  async function handleCreate() {
    if (selected.length === 0) {
      toast.error("เลือกอย่างน้อย 1 คน");
      return;
    }
    setSaving(true);
    try {
      const convo = await startConversation({
        createdBy: session?.user?.id,
        participantIds: selected,
        isGroup,
        name: isGroup ? groupName || "กลุ่มแชท" : null,
      });
      onCreated(convo.id);
    } catch (err) {
      toast.error("สร้างแชทไม่สำเร็จ: " + errMsg(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="เริ่มแชทใหม่" onClose={onClose}>
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => { setIsGroup(false); setSelected((s) => s.slice(0, 1)); }}
          className={`flex-1 py-2 rounded-xl text-sm font-medium border ${!isGroup ? "bg-indigo-600 text-white border-indigo-600" : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"}`}
        >
          แชท 1-1
        </button>
        <button
          onClick={() => setIsGroup(true)}
          className={`flex-1 py-2 rounded-xl text-sm font-medium border ${isGroup ? "bg-indigo-600 text-white border-indigo-600" : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"}`}
        >
          สร้างกลุ่ม
        </button>
      </div>

      {isGroup && (
        <Field label="ชื่อกลุ่ม">
          <TextInput value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="เช่น ทีมติดตั้ง" />
        </Field>
      )}

      <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">{isGroup ? "เลือกสมาชิก" : "เลือกคนที่จะคุยด้วย"}</p>
      <div className="max-h-56 overflow-auto space-y-1 mb-4">
        {users?.filter((u) => u.id !== session?.user?.id).map((u) => (
          <label key={u.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer">
            <input type={isGroup ? "checkbox" : "radio"} checked={selected.includes(u.id)} onChange={() => toggleUser(u.id)} className="accent-indigo-600" />
            <span className={`w-6 h-6 rounded-full ${colorFor(u.name)} text-white text-xs flex items-center justify-center font-semibold`}>{u.name?.slice(0, 1)}</span>
            <span className="text-sm text-slate-700 dark:text-slate-200">{u.name} <span className="text-slate-400">({u.role})</span></span>
          </label>
        ))}
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-700">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">ยกเลิก</button>
        <button onClick={handleCreate} disabled={saving} className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm disabled:opacity-60">
          {saving ? "กำลังสร้าง..." : "เริ่มแชท"}
        </button>
      </div>
    </Modal>
  );
}

export default function ChatPage() {
  const { session } = useAuth();
  const myId = session?.user?.id;
  const toast = useToast();
  const { data: conversations, refetch: refetchConvos } = useQuery(() => listConversations(myId), [myId]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [showNewModal, setShowNewModal] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!activeId) return;
    let mounted = true;
    listMessages(activeId).then((m) => mounted && setMessages(m));
    const unsubscribe = subscribeToMessages(activeId, (row) => {
      setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, { ...row, sender: { id: row.sender_id, name: null } }]));
    });
    return () => { mounted = false; unsubscribe(); };
  }, [activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const activeConvo = useMemo(() => conversations?.find((c) => c.id === activeId), [conversations, activeId]);

  async function handleSend() {
    if (!text.trim() || !activeId) return;
    const body = text;
    setText("");
    try {
      await sendMessage(activeId, myId, body);
    } catch (err) {
      toast.error("ส่งไม่สำเร็จ: " + errMsg(err));
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight mb-6">แชทภายในทีม</h1>

      <div className="grid grid-cols-12 gap-5" style={{ height: "70vh" }}>
        <Card className="col-span-4 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 dark:border-slate-700">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">การสนทนา</span>
            <button onClick={() => setShowNewModal(true)} className="text-indigo-600 hover:text-indigo-700"><Plus className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-auto">
            {(!conversations || conversations.length === 0) && (
              <p className="text-sm text-slate-400 text-center py-8 px-4">ยังไม่มีบทสนทนา — กด + เพื่อเริ่มแชท</p>
            )}
            {conversations?.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={`w-full flex items-center gap-2.5 px-4 py-3 text-left border-b border-slate-50 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 ${activeId === c.id ? "bg-indigo-50 dark:bg-indigo-500/10" : ""}`}
              >
                <span className={`w-8 h-8 rounded-full ${c.is_group ? "bg-slate-400" : colorFor(conversationLabel(c, myId))} text-white flex items-center justify-center shrink-0`}>
                  {c.is_group ? <UsersIcon className="w-4 h-4" /> : <span className="text-xs font-semibold">{conversationLabel(c, myId).slice(0, 1)}</span>}
                </span>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{conversationLabel(c, myId)}</span>
              </button>
            ))}
          </div>
        </Card>

        <Card className="col-span-8 flex flex-col overflow-hidden">
          {!activeConvo ? (
            <div className="flex-1 flex items-center justify-center text-sm text-slate-400">เลือกบทสนทนาทางซ้าย หรือเริ่มแชทใหม่</div>
          ) : (
            <>
              <div className="px-4 py-3.5 border-b border-slate-100 dark:border-slate-700">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{conversationLabel(activeConvo, myId)}</span>
              </div>
              <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-3 space-y-3">
                {messages.map((m) => {
                  const mine = m.sender?.id === myId || m.sender_id === myId;
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[70%] rounded-2xl px-3.5 py-2 text-sm ${mine ? "bg-indigo-600 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200"}`}>
                        {!mine && activeConvo.is_group && <p className="text-xs font-semibold mb-0.5 opacity-70">{m.sender?.name}</p>}
                        <p className="whitespace-pre-wrap">{m.body}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="p-3 border-t border-slate-100 dark:border-slate-700 flex items-center gap-2">
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="พิมพ์ข้อความ..."
                  className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button onClick={handleSend} className="w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center shrink-0">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </Card>
      </div>

      {showNewModal && (
        <NewConversationModal
          onClose={() => setShowNewModal(false)}
          onCreated={(convoId) => {
            setShowNewModal(false);
            refetchConvos();
            setActiveId(convoId);
          }}
        />
      )}
    </div>
  );
}
