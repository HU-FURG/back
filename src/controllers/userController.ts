import { Request, Response } from 'express';
import { prisma } from '../prisma/client';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import bcrypt from "bcrypt";

const loginSchema = z.object({
  login: z.string(),
  senha: z.string(),
  remember: z.boolean()
});


const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

export async function login(req: Request, res: Response) {
  try {
    const { login, senha, remember } = loginSchema.parse(req.body);

    // verifica se o usuário existe
    const user = await prisma.user.findUnique({
      where: { login },
    });

    if (!user) {
      return res.status(401).json({ error: 'Login ou senha incorretos' });
    }

    // compara a senha digitada com o hash do banco
    const senhaValida = await bcrypt.compare(senha, user.senha);
    if (!senhaValida) {
      return res.status(401).json({ error: 'Login ou senha incorretos' });
    }
    
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLogin_at: new Date(),
      },
    });

    // gera token JWT
    const token = jwt.sign(
      { userId: user.id, login: user.login },
      JWT_SECRET,
      { expiresIn: remember ? '30d' : '24h' }
    );

    // envia token no cookie HTTP-only
    res.cookie('token', token, {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: remember ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000,
    });
    const cargo = user.hierarquia
    return res.status(200).json({ login, cargo });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }

    console.error('Erro ao logar:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}

export async function validateToken(req: Request, res: Response) {
    const {login} = (req as any).user;
    res.json({ valid: true, login });
}

export function logout(req: Request, res: Response) {
  try {
    res.clearCookie("token", {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return res.status(200).json({ success: true, message: "Logout realizado com sucesso" });
  } catch (err) {
    console.error("Erro no logout:", err);
    return res.status(500).json({ error: "Erro interno no logout" });
  }
}


const createUserSchema = z.object({
  login: z.string(),
  senha: z.string(),
  cargo: z.string().optional(), // default pode ser "user"
});

export async function createUser(req: Request, res: Response) {
  try {
    const { login, senha, cargo } = createUserSchema.parse(req.body);

    // checa se já existe
    const exists = await prisma.user.findUnique({ where: { login } });
    if (exists) return res.status(400).json({ error: "Usuário já existe" });

    // hash da senha
    const hashedPassword = await bcrypt.hash(senha, 10); 

    // salvar usuário
    const newUser = await prisma.user.create({
      data: {
        login,
        senha: hashedPassword, 
        hierarquia: cargo || "user",
      },
    });

    res.status(201).json({ login: newUser.login, cargo: newUser.hierarquia });
  } catch (err) {
    console.error("Erro ao criar usuário:", err);
    res.status(500).json({ error: "Erro interno" });
  }
}

const removeUserSchema = z.object({
  login: z.string(),
});

export async function removeUser(req: Request, res: Response) {
  try {
    const { login } = removeUserSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { login } });
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

    await prisma.user.delete({ where: { login } });

    res.json({ success: true, login });
  } catch (err) {
    console.error("Erro ao remover usuário:", err);
    res.status(500).json({ error: "Erro interno" });
  }
}

export async function getUsers(req: Request, res: Response) {
  try {
    // pega todos usuários que não são admin
    const users = await prisma.user.findMany({
      where: {
        hierarquia: { not: "admin" }, // filtra admin
      },
      select: {
        login: true,
        hierarquia: true,
        lastLogin_at: true,
      },
    });

    res.json(users);
  } catch (err) {
    console.error("Erro ao buscar usuários:", err);
    res.status(500).json({ error: "Erro interno" });
  }
}