import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from "../prisma/client";

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies.token; // agora pega do cookie
  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.sendStatus(403);
    (req as any).user = user;
    next();
  });
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const userLogin = (req as any).user?.login; //!chega aqui?
  if (!userLogin) return res.status(401).json({ error: "Não autenticado" });

  const user = await prisma.user.findUnique({ where: { login: userLogin } });
  if (!user) return res.status(401).json({ error: "Usuário não encontrado" });

  if (user.hierarquia !== "admin") { 
    return res.status(403).json({ error: "Acesso negado: admin apenas" });
  }

  next();
}