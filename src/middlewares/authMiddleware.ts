import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from "../prisma/client";

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

export function authenticateToken(req: Request, res: Response, next: NextFunction) { // verifica o jwt ainda é valido
  const token = req.cookies.token; // agora pega do cookie
  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.sendStatus(403);
    (req as any).user = user;
    next();
  });
}

export function requireRole(roles: string[]) { // verificar se o usuario pode ou n ter acesso
  return async (req: Request, res: Response, next: NextFunction) => {
    const userLogin = (req as any).user?.login;
    if (!userLogin) return res.status(401).json({ error: "Não autenticado" });

    const user = await prisma.user.findUnique({ where: { login: userLogin } });
    if (!user) return res.status(401).json({ error: "Usuário não encontrado" });

    if (!roles.includes(user.hierarquia)) {
      return res.status(403).json({ error: "Acesso não permitido para esse cargo" });
    }

    next();
  };
}
