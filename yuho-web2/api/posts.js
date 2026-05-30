// // 서버 메모리 저장소 (주의: Vercel은 서버리스라 일정 시간 뒤 메모리가 초기화됩니다)
// let posts = [];

// export default function handler(req, res) {
//     res.setHeader('Content-Type', 'application/json');

//     // 1. 게시글 조회 (GET)
//     if (req.method === 'GET') {
//         return res.status(200).json(posts.slice().sort((a, b) => b.id - a.id));
//     }

//     // 2. 게시글 등록 (POST)
//     if (req.method === 'POST') {
//         const { title, content, author } = req.body;
//         if (!title || !content) {
//             return res.status(400).json({ message: "제목과 내용을 입력해주세요." });
//         }

//         const newPost = {
//             id: Date.now().toString(), // ID를 문자열로 관리하는 것이 안정적입니다
//             title,
//             content,
//             author: author || "익명",
//             date: new Date().toLocaleDateString("ko-KR")
//         };

//         posts.push(newPost);
//         return res.status(201).json(newPost);
//     }

//     // 3. 게시글 수정 (PUT)
//     if (req.method === 'PUT') {
//         const { id } = req.query;
//         const { title, content } = req.body;
        
//         const index = posts.findIndex(p => p.id === id);
//         if (index !== -1) {
//             posts[index] = { ...posts[index], title, content };
//             return res.status(200).json(posts[index]);
//         }
//         return res.status(404).json({ message: "게시글을 찾을 수 없습니다." });
//     }

//     // 4. 게시글 삭제 (DELETE)
//     if (req.method === 'DELETE') {
//         const { id } = req.query;
        
//         const initialLength = posts.length;
//         posts = posts.filter(p => p.id !== id);
        
//         if (posts.length < initialLength) {
//             return res.status(200).json({ message: "삭제 성공" });
//         }
//         return res.status(404).json({ message: "게시글을 찾을 수 없습니다." });
//     }

//     res.status(405).json({ message: "Method Not Allowed" });
// }


import { ObjectId } from "mongodb";
import { getDb } from "../lib/db.js";
import { getUserFromReq } from "../lib/auth.js";

export default async function handler(req, res) {
  const db = await getDb();
  const user = getUserFromReq(req);

  if (req.method === "GET") {
    const posts = await db
      .collection("posts")
      .find({ status: "active" })
      .sort({ isPinned: -1, isNotice: -1, createdAt: -1 })
      .toArray();

    const visiblePosts = posts.map((post) => {
      const authorId = post.authorId?.toString?.() || post.authorId;
      const isOwner = user && (user.id === authorId);
      const isAdmin = user && user.role === "admin";

      if (post.isSecret && !isOwner && !isAdmin) {
        return {
          ...post,
          title: "비밀글입니다.",
          content: "작성자와 관리자만 볼 수 있습니다."
        };
      }

      return {
        ...post,
        _id: post._id.toString(),
        authorId
      };
    });

    return res.status(200).json(visiblePosts);
  }

  if (req.method === "POST") {
    if (!user) {
      return res.status(401).json({ message: "로그인이 필요합니다." });
    }

    const { title, content, isSecret = false } = req.body;

    if (!title || !content) {
      return res.status(400).json({ message: "제목과 내용을 입력하세요." });
    }

    const newPost = {
      title,
      content,
      isSecret: !!isSecret,
      isNotice: false,
      isPinned: false,
      status: "active",
      authorId: user.role === "admin" ? "admin-fixed-id" : new ObjectId(user.id),
      authorName: user.name || user.username,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await db.collection("posts").insertOne(newPost);

    return res.status(201).json({
      message: "등록 완료",
      postId: result.insertedId.toString()
    });
  }

  if (req.method === "PATCH") {
    if (!user) {
      return res.status(401).json({ message: "로그인이 필요합니다." });
    }

    const { postId, title, content, isSecret } = req.body;
    const post = await db.collection("posts").findOne({ _id: new ObjectId(postId) });

    if (!post || post.status !== "active") {
      return res.status(404).json({ message: "게시글을 찾을 수 없습니다." });
    }

    const authorId = post.authorId?.toString?.() || post.authorId;
    const isOwner = user.id === authorId;
    const isAdmin = user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: "수정 권한이 없습니다." });
    }

    await db.collection("audit_logs").insertOne({
      type: "update",
      postId: post._id,
      actorId: user.id,
      actorName: user.username,
      before: {
        title: post.title,
        content: post.content,
        isSecret: post.isSecret
      },
      after: {
        title,
        content,
        isSecret
      },
      createdAt: new Date()
    });

    await db.collection("posts").updateOne(
      { _id: post._id },
      {
        $set: {
          title: title ?? post.title,
          content: content ?? post.content,
          isSecret: typeof isSecret === "boolean" ? isSecret : post.isSecret,
          updatedAt: new Date()
        }
      }
    );

    return res.status(200).json({ message: "수정 완료" });
  }

  if (req.method === "DELETE") {
    if (!user) {
      return res.status(401).json({ message: "로그인이 필요합니다." });
    }

    const { postId } = req.body;
    const post = await db.collection("posts").findOne({ _id: new ObjectId(postId) });

    if (!post || post.status !== "active") {
      return res.status(404).json({ message: "게시글을 찾을 수 없습니다." });
    }

    const authorId = post.authorId?.toString?.() || post.authorId;
    const isOwner = user.id === authorId;
    const isAdmin = user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: "삭제 권한이 없습니다." });
    }

    await db.collection("audit_logs").insertOne({
      type: "delete",
      postId: post._id,
      actorId: user.id,
      actorName: user.username,
      before: {
        title: post.title,
        content: post.content,
        isSecret: post.isSecret
      },
      createdAt: new Date()
    });

    await db.collection("posts").updateOne(
      { _id: post._id },
      {
        $set: {
          status: "deleted",
          deletedAt: new Date(),
          deletedBy: user.username
        }
      }
    );

    return res.status(200).json({ message: "삭제 완료" });
  }

  return res.status(405).json({ message: "허용되지 않은 메서드입니다." });
}