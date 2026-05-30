import { getDb } from "../lib/db.js";
import { getUserFromReq } from "../lib/auth.js";

export default async function handler(req, res) {
  const db = await getDb();
  const user = getUserFromReq(req);

  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "관리자만 접근할 수 있습니다." });
  }

  if (req.method === "GET") {
    const { action } = req.query;

    if (action === "dashboard") {
      const deletedPosts = await db.collection("posts")
        .find({ status: "deleted" })
        .sort({ deletedAt: -1 })
        .toArray();

      const auditLogs = await db.collection("audit_logs")
        .find({})
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray();

      return res.status(200).json({
        deletedPosts,
        auditLogs
      });
    }

    return res.status(400).json({ message: "잘못된 요청입니다." });
  }

  if (req.method === "POST") {
    const { action } = req.query;

    if (action === "notice") {
      const { title, content, isPinned = true } = req.body;

      if (!title || !content) {
        return res.status(400).json({ message: "제목과 내용을 입력하세요." });
      }

      await db.collection("posts").insertOne({
        title,
        content,
        isSecret: false,
        isNotice: true,
        isPinned: !!isPinned,
        status: "active",
        authorId: "admin-fixed-id",
        authorName: user.username,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      return res.status(201).json({ message: "공지 등록 완료" });
    }

    return res.status(400).json({ message: "잘못된 요청입니다." });
  }

  return res.status(405).json({ message: "허용되지 않은 메서드입니다." });
}