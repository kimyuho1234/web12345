import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;

export function signToken(user) {
  return jwt.sign(
    {
      id: user._id,
      username: user.username,
      name: user.name || user.username,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export function getTokenFromReq(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.split(" ")[1];
}

export function getUserFromReq(req) {
  const token = getTokenFromReq(req);
  if (!token) return null;

  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}