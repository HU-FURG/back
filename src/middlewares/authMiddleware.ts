import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../prisma/client";

const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

export function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({
      error: { code: "TOKEN_MISSING", message: "Token não fornecido" },
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    (req as any).user = decoded;
    next();
  } catch {
    return res.status(403).json({
      error: { code: "TOKEN_INVALID", message: "Token inválido ou expirado" },
    });
  }
}

export function requireRole(roles: string[]) {
  // verificar se o usuario pode ou n ter acesso
  return async (req: Request, res: Response, next: NextFunction) => {
    const userLogin = (req as any).user?.login;
    if (!userLogin) return res.status(401).json({ error: "Não autenticado" });

    const user = await prisma.user.findUnique({ where: { login: userLogin } });
    if (!user) return res.status(401).json({ error: "Usuário não encontrado" });

    if (!roles.includes(user.hierarquia)) {
      return res
        .status(403)
        .json({ error: "Acesso não permitido para esse cargo" });
    }

    next();
  };
}
