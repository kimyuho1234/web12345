import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";
import { getDb } from "../lib/db.js";
import { signToken, getUserFromReq } from "../lib/auth.js";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SITE_URL = "https://yuho-web.vercel.app";

const SOCIAL_LOGIN_KEYS = {
  google: {
    clientId: "",
    clientSecret: ""
  },
  github: {
    clientId: "",
    clientSecret: ""
  },
  kakao: {
    clientId: "",
    clientSecret: ""
  }
};

const SOCIAL_PROVIDERS = {
  google: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userUrl: "https://www.googleapis.com/oauth2/v3/userinfo",
    clientId: SOCIAL_LOGIN_KEYS.google.clientId,
    clientSecret: SOCIAL_LOGIN_KEYS.google.clientSecret,
    scope: "openid email profile"
  },
  github: {
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userUrl: "https://api.github.com/user",
    emailUrl: "https://api.github.com/user/emails",
    clientId: SOCIAL_LOGIN_KEYS.github.clientId,
    clientSecret: SOCIAL_LOGIN_KEYS.github.clientSecret,
    scope: "read:user user:email"
  },
  kakao: {
    authUrl: "https://kauth.kakao.com/oauth/authorize",
    tokenUrl: "https://kauth.kakao.com/oauth/token",
    userUrl: "https://kapi.kakao.com/v2/user/me",
    clientId: SOCIAL_LOGIN_KEYS.kakao.clientId,
    clientSecret: SOCIAL_LOGIN_KEYS.kakao.clientSecret,
    scope: "profile_nickname account_email"
  }
};

function getBaseUrl(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || (host && host.includes("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : SITE_URL;
}

function redirectWithError(res, req, message) {
  const baseUrl = getBaseUrl(req);
  res.writeHead(302, { Location: `${baseUrl}/?auth_error=${encodeURIComponent(message)}` });
  res.end();
}

async function exchangeCode(provider, code, redirectUri) {
  const config = SOCIAL_PROVIDERS[provider];
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: redirectUri
  });

  const tokenRes = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(tokenData.error_description || tokenData.error || "토큰 발급에 실패했습니다.");
  }
  return tokenData.access_token;
}

async function fetchSocialProfile(provider, accessToken) {
  const config = SOCIAL_PROVIDERS[provider];
  const userRes = await fetch(config.userUrl, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`
    }
  });
  const profile = await userRes.json();
  if (!userRes.ok) throw new Error("프로필 정보를 가져오지 못했습니다.");

  if (provider === "google") {
    return { providerId: profile.sub, email: profile.email, name: profile.name || profile.email };
  }

  if (provider === "github") {
    let email = profile.email;
    if (!email && config.emailUrl) {
      const emailRes = await fetch(config.emailUrl, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`
        }
      });
      const emails = await emailRes.json();
      if (emailRes.ok && Array.isArray(emails)) {
        const primary = emails.find((item) => item.primary && item.verified) || emails.find((item) => item.verified);
        email = primary?.email;
      }
    }
    return { providerId: String(profile.id), email, name: profile.name || profile.login || email };
  }

  if (provider === "kakao") {
    return {
      providerId: String(profile.id),
      email: profile.kakao_account?.email,
      name: profile.kakao_account?.profile?.nickname || profile.properties?.nickname
    };
  }

  throw new Error("지원하지 않는 소셜 로그인입니다.");
}

async function upsertSocialUser(db, provider, socialProfile) {
  if (!socialProfile.providerId) throw new Error("소셜 계정 ID가 없습니다.");
  const socialKey = `${provider}:${socialProfile.providerId}`;
  const username = socialProfile.email || `${socialKey}@social.local`;
  const name = socialProfile.name || username;

  const existing = await db.collection("users").findOne({ $or: [{ socialKey }, { username }] });
  if (existing) {
    await db.collection("users").updateOne(
      { _id: existing._id },
      { $set: { socialKey, provider, username, name, updatedAt: new Date() } }
    );
    return { ...existing, socialKey, provider, username, name };
  }

  const user = {
    name,
    username,
    socialKey,
    provider,
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date()
  };
  const result = await db.collection("users").insertOne(user);
  return { ...user, _id: result.insertedId };
}
export default async function handler(req, res) {
  const db = await getDb();

  if (req.method === "POST") {
    const { action } = req.query;

    if (action === "register") {
      const { name, username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ message: "아이디와 비밀번호를 입력하세요." });
      }

      if (username === ADMIN_USERNAME) {
        return res.status(403).json({ message: "이 아이디는 사용할 수 없습니다." });
      }

      const existing = await db.collection("users").findOne({ username });
      if (existing) {
        return res.status(409).json({ message: "이미 존재하는 아이디입니다." });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const result = await db.collection("users").insertOne({
        name,
        username,
        passwordHash,
        role: "user",
        createdAt: new Date()
      });

      return res.status(201).json({
        message: "회원가입 완료",
        userId: result.insertedId
      });
    }

    if (action === "login") {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ message: "아이디와 비밀번호를 입력하세요." });
      }

      // 1. 관리자 고정 계정 우선 검사
      if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        const adminUser = {
          _id: "admin-fixed-id",
          username: ADMIN_USERNAME,
          name: "관리자",
          role: "admin"
        };

        const token = signToken(adminUser);

        return res.status(200).json({
          message: "관리자 로그인 성공",
          token,
          user: adminUser
        });
      }

      // 2. 일반 사용자 검사
      const user = await db.collection("users").findOne({ username });
      if (!user) {
        return res.status(401).json({ message: "아이디 또는 비밀번호가 틀립니다." });
      }

      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) {
        return res.status(401).json({ message: "아이디 또는 비밀번호가 틀립니다." });
      }

      const token = signToken({
        _id: user._id.toString(),
        username: user.username,
        role: "user"
      });

      return res.status(200).json({
        message: "로그인 성공",
        token,
        user: {
          _id: user._id.toString(),
          username: user.username,
          name: user.name || user.username,
          role: "user"
        }
      });
    }

    return res.status(400).json({ message: "잘못된 요청입니다." });
  }

  if (req.method === "GET") {
    const { action, provider, code } = req.query;

    if (action === "social") {
      const selectedProvider = String(provider || "").toLowerCase();
      const config = SOCIAL_PROVIDERS[selectedProvider];
      if (!config) return redirectWithError(res, req, "지원하지 않는 소셜 로그인입니다.");
      if (!config.clientId || !config.clientSecret) {
        return redirectWithError(res, req, `${selectedProvider} 소셜 로그인 키가 api/auth1.js 상단에 설정되지 않았습니다.`);
      }

      const baseUrl = getBaseUrl(req);
      const redirectUri = `${baseUrl}/api/auth1?action=social&provider=${selectedProvider}`;

      if (!code) {
        const params = new URLSearchParams({
          client_id: config.clientId,
          redirect_uri: redirectUri,
          response_type: "code",
          scope: config.scope
        });
        if (selectedProvider === "kakao") params.set("prompt", "login");
        res.writeHead(302, { Location: `${config.authUrl}?${params.toString()}` });
        res.end();
        return;
      }

      try {
        const accessToken = await exchangeCode(selectedProvider, code, redirectUri);
        const socialProfile = await fetchSocialProfile(selectedProvider, accessToken);
        const socialUser = await upsertSocialUser(db, selectedProvider, socialProfile);
        const appUser = {
          _id: socialUser._id.toString(),
          username: socialUser.username,
          email: socialUser.username,
          name: socialUser.name || socialUser.username,
          role: socialUser.role || "user",
          provider: selectedProvider
        };
        const token = signToken(appUser);
        const encodedUser = Buffer.from(JSON.stringify(appUser)).toString("base64");
        res.writeHead(302, { Location: `${baseUrl}/?token=${encodeURIComponent(token)}&user=${encodeURIComponent(encodedUser)}` });
        res.end();
        return;
      } catch (error) {
        return redirectWithError(res, req, error.message || "소셜 로그인에 실패했습니다.");
      }
    }

    const user = getUserFromReq(req);

    if (!user) {
      return res.status(401).json({ message: "로그인이 필요합니다." });
    }

    if (user.role === "admin") {
      return res.status(200).json({
        user: {
          _id: "admin-fixed-id",
          username: ADMIN_USERNAME,
          role: "admin"
        }
      });
    }

    const dbUser = await db.collection("users").findOne(
      { _id: new ObjectId(user.id || user._id) },
      { projection: { passwordHash: 0 } }
    );

    if (!dbUser) {
      return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
    }

    return res.status(200).json({
      user: {
        _id: dbUser._id.toString(),
        username: dbUser.username,
        name: dbUser.name || dbUser.username,
        role: dbUser.role
      }
    });
  }

  return res.status(405).json({ message: "허용되지 않은 메서드입니다." });
}

