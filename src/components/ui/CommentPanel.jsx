import React, { useEffect, useRef, useState } from "react";
import { Paperclip, Send } from "lucide-react";
import { Pill, Select } from "./primitives.jsx";
import { useAuth } from "../../hooks/useAuth.jsx";
import { useQuery } from "../../hooks/useQuery.js";
import { listComments, createComment } from "../../api/comments.js";
import { listUsers } from "../../api/users.js";
import { useToast } from "../../hooks/useToast.jsx";
import { errMsg } from "../../lib/format.js";

const AVATAR_COLORS = ["bg-slate-800", "bg-slate-500", "bg-orange-500", "bg-slate-500", "bg-rose-500", "bg-slate-500"];
function colorFor(name) {
  if (!name) return AVATAR_COLORS[0];
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

function timeAgo(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("th-TH", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function CommentPanel({ entityType, entityId, statusOptions = [] }) {
  const { profile, session } = useAuth();
  const toast = useToast();
  const { data: comments, loading, error: loadError, refetch } = useQuery(() => listComments(entityType, entityId), [entityType, entityId]);

  useEffect(() => {
    if (loadError) console.error("Failed to load comments:", loadError);
  }, [loadError]);
  useEffect(() => {
    setLocalComments([]);
  }, [entityType, entityId]);
  const { data: users } = useQuery(() => listUsers(), []);

  const [text, setText] = useState("");
  const [tag, setTag] = useState("");
  const [mentioned, setMentioned] = useState([]); // [{id, name}]
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [sending, setSending] = useState(false);
  const [localComments, setLocalComments] = useState([]); // optimistic, shown immediately on send
  const inputRef = useRef(null);

  const currentUserId = session?.user?.id;
  const currentUserName = profile?.name || session?.user?.email || "ผู้ใช้งาน";

  // Merge server comments with anything sent locally that the server list
  // hasn't caught up to yet (deduped by id). This means a comment you just
  // sent shows up immediately even if the follow-up read is slow, cached,
  // or has any issue of its own — the send itself is what matters.
  const allComments = [
    ...(comments || []),
    ...localComments.filter((lc) => !(comments || []).some((c) => c.id === lc.id)),
  ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const mentionCandidates = (users || [])
    .filter((u) => u.id !== currentUserId)
    .filter((u) => !mentionQuery || u.name?.toLowerCase().includes(mentionQuery.toLowerCase()));

  function handleChange(e) {
    const v = e.target.value;
    setText(v);
    // Bug fix: the old check was `v.endsWith("@")`, which closed the
    // dropdown the instant you typed one more character to filter it —
    // making @mention practically unusable. Now detects "@" followed by
    // any run of non-space characters right up to the cursor, and keeps
    // the list open (filtered live) the whole time you're typing a name.
    const match = v.slice(0, e.target.selectionStart ?? v.length).match(/@([^\s@]*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setShowMentions(true);
    } else {
      setShowMentions(false);
    }
  }

  function insertMention(user) {
    setText((t) => t.replace(/@([^\s@]*)$/, `@${user.name.split(" ")[0]} `));
    setMentioned((m) => (m.some((u) => u.id === user.id) ? m : [...m, { id: user.id, name: user.name }]));
    setShowMentions(false);
    setMentionQuery("");
    inputRef.current?.focus();
  }

  async function send() {
    if (!text.trim() || sending) return;
    if (!currentUserId) {
      toast.error("ยังไม่พร้อมส่ง — กรุณารอสักครู่แล้วลองใหม่ (โหลดข้อมูลผู้ใช้งานไม่เสร็จ)");
      return;
    }
    if (!entityId) {
      toast.error("ไม่พบ Record นี้ในระบบ — บันทึกข้อมูลหลักก่อนแล้วลองใหม่");
      return;
    }
    setSending(true);
    try {
      const created = await createComment({
        entityType,
        entityId,
        authorId: currentUserId,
        body: text,
        statusTag: tag || null,
        mentionedUserIds: mentioned.map((m) => m.id),
      });
      // Show it immediately — don't wait on refetch to confirm it worked.
      setLocalComments((lc) => [
        ...lc,
        { id: created.id, body: text, status_tag: tag || null, created_at: created.created_at, author: { id: currentUserId, name: currentUserName } },
      ]);
      setText("");
      setTag("");
      setMentioned([]);
      refetch();
    } catch (err) {
      console.error("Comment send failed:", err);
      toast.error("ส่งคอมเมนต์ไม่สำเร็จ: " + errMsg(err));
    } finally {
      setSending(false);
    }
  }

  if (!entityId) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 text-center">
        <p className="text-sm text-slate-400">บันทึกข้อมูลก่อน จึงจะเริ่มคอมเมนต์ได้</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col h-full">
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Comments & Updates</h3>
        <p className="text-xs text-slate-400 mt-0.5">พิมพ์ @ เพื่อแท็กเพื่อนร่วมทีม</p>
      </div>

      <div className="flex-1 overflow-auto px-5 py-4 space-y-4 max-h-96">
        {loading && <p className="text-sm text-slate-400 text-center py-4">กำลังโหลด...</p>}
        {loadError && (
          <p className="text-sm text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 rounded-lg px-3 py-2 text-center">
            โหลดคอมเมนต์ไม่สำเร็จ: {errMsg(loadError)}
          </p>
        )}
        {!loading && !loadError && allComments.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-4">ยังไม่มีคอมเมนต์ — เริ่มต้นได้เลย</p>
        )}
        {allComments.map((c) => (
          <div key={c.id} className="flex gap-3">
            <div className={`w-8 h-8 rounded-full ${colorFor(c.author?.name)} flex items-center justify-center text-white text-xs font-semibold shrink-0`}>
              {(c.author?.name || "?").slice(0, 1)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{c.author?.name || "ผู้ใช้งาน"}</span>
                <span className="text-xs text-slate-400">{timeAgo(c.created_at)}</span>
              </div>
              {c.status_tag && (
                <div className="mt-1">
                  <Pill tone="indigo">{c.status_tag}</Pill>
                </div>
              )}
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed whitespace-pre-wrap">{c.body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-100 dark:border-slate-700 p-4">
        {statusOptions.length > 0 && (
          <Select value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">แปะสถานะประกอบ (ไม่บังคับ)</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
        )}

        {mentioned.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {mentioned.map((m) => (
              <Pill key={m.id} tone="indigo">@{m.name}</Pill>
            ))}
          </div>
        )}

        <div className="relative mt-2.5">
          <textarea
            ref={inputRef}
            value={text}
            onChange={handleChange}
            onBlur={() => setTimeout(() => setShowMentions(false), 150)}
            rows={2}
            placeholder="พิมพ์คอมเมนต์... ใช้ @ เพื่อแท็กเพื่อนร่วมทีม"
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none"
          />
          {showMentions && (
            <div className="absolute z-10 bottom-full mb-1 w-56 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg py-1.5 max-h-48 overflow-auto">
              {mentionCandidates.length === 0 && (
                <p className="px-3 py-1.5 text-sm text-slate-400">ไม่พบผู้ใช้งาน</p>
              )}
              {mentionCandidates.map((u) => (
                <button
                  key={u.id}
                  onMouseDown={() => insertMention(u)}
                  className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800/10 text-slate-700 dark:text-slate-200"
                >
                  <span className={`w-5 h-5 rounded-full ${colorFor(u.name)} text-white text-xs flex items-center justify-center font-semibold`}>
                    {u.name.slice(0, 1)}
                  </span>
                  {u.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-2.5">
          <button className="text-slate-400 hover:text-slate-900" title="แนบไฟล์ (เร็วๆ นี้)">
            <Paperclip className="w-4 h-4" />
          </button>
          <button
            onClick={send}
            disabled={sending}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white shadow-sm disabled:opacity-60"
          >
            <Send className="w-3.5 h-3.5" /> {sending ? "กำลังส่ง..." : "ส่ง"}
          </button>
        </div>
      </div>
    </div>
  );
}
