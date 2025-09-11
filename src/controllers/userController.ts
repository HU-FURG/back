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
    console.log("👉 Requisição de login recebida:", req.body);

    const { login, senha, remember } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { login },
    });
    console.log("🔍 Usuário encontrado no banco:", user);

    if (!user) {
      console.warn("⚠️ Usuário não existe:", login);
      return res.status(401).json({ error: 'Login ou senha incorretos' });
    }

    const senhaValida = await bcrypt.compare(senha, user.senha);
    console.log("🔑 Senha válida?", senhaValida);

    if (!senhaValida) {
      console.warn("⚠️ Senha inválida para usuário:", login);
      return res.status(401).json({ error: 'Login ou senha incorretos' });
    }
    
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin_at: new Date() },
    });
    console.log("📅 Atualizado lastLogin_at para:", user.login);

    const token = jwt.sign(
      { userId: user.id, login: user.login },
      JWT_SECRET,
      { expiresIn: remember ? '30d' : '24h' }
    );
    console.log("✅ Token JWT gerado:", token.substring(0, 20) + "...");

    res.cookie('token', token, {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: remember ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000,
    });

    const cargo = user.hierarquia;
    console.log("✅ Login bem sucedido:", { login, cargo });
    return res.status(200).json({ login, cargo });

  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("❌ Erro de validação no login:", error.errors);
      return res.status(400).json({ errors: error.errors });
    }

    console.error('❌ Erro ao logar:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}

export async function validateToken(req: Request, res: Response) {
  const { login } = (req as any).user;
  console.log("🔐 Token validado para:", login);
  res.json({ valid: true, login });
}

export function logout(req: Request, res: Response) {
  try {
    console.log("🚪 Logout solicitado");
    res.clearCookie("token", {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return res.status(200).json({ success: true, message: "Logout realizado com sucesso" });
  } catch (err) {
    console.error("❌ Erro no logout:", err);
    return res.status(500).json({ error: "Erro interno no logout" });
  }
}

const createUserSchema = z.object({
  login: z.string(),
  senha: z.string(),
  cargo: z.string().optional(),
});

export async function createUser(req: Request, res: Response) {
  try {
    console.log("👤 Criando usuário:", req.body);

    const { login, senha, cargo } = createUserSchema.parse(req.body);

    const exists = await prisma.user.findUnique({ where: { login } });
    if (exists) {
      console.warn("⚠️ Usuário já existe:", login);
      return res.status(400).json({ error: "Usuário já existe" });
    }

    const hashedPassword = await bcrypt.hash(senha, 10);
    const newUser = await prisma.user.create({
      data: { login, senha: hashedPassword, hierarquia: cargo || "user" },
    });

    console.log("✅ Usuário criado:", newUser);
    res.status(201).json({ login: newUser.login, cargo: newUser.hierarquia });
  } catch (err) {
    console.error("❌ Erro ao criar usuário:", err);
    res.status(500).json({ error: "Erro interno" });
  }
}

export async function removeUser(req: Request, res: Response) {
  try {
    console.log("🗑️ Removendo usuário:", req.body);

    const { login } = z.object({ login: z.string() }).parse(req.body);

    const user = await prisma.user.findUnique({ where: { login } });
    if (!user) {
      console.warn("⚠️ Usuário não encontrado:", login);
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    await prisma.user.delete({ where: { login } });
    console.log("✅ Usuário removido:", login);

    res.json({ success: true, login });
  } catch (err) {
    console.error("❌ Erro ao remover usuário:", err);
    res.status(500).json({ error: "Erro interno" });
  }
}

export async function getUsers(req: Request, res: Response) {
  try {
    console.log("📋 Buscando lista de usuários...");

    const users = await prisma.user.findMany({
      where: { hierarquia: { not: "admin" } },
      select: { login: true, hierarquia: true, lastLogin_at: true },
    });

    console.log("✅ Usuários encontrados:", users);
    res.json(users);
  } catch (err) {
    console.error("❌ Erro ao buscar usuários:", err);
    res.status(500).json({ error: "Erro interno" });
  }
}

export async function loginAnonimo(req: Request, res: Response) {
  try {
    console.log("👤 Login anônimo solicitado");

    const anonLogin = "anonimo";
    const anonSenha = "1234";

    let user = await prisma.user.findUnique({ where: { login: anonLogin } });
    console.log("🔍 Usuário anonimo encontrado?", !!user);

    if (!user) {
      console.log("⚙️ Criando usuário anonimo...");
      const hashedPassword = await bcrypt.hash(anonSenha, 10);
      user = await prisma.user.create({
        data: { login: anonLogin, senha: hashedPassword, hierarquia: "admin" },
      });
      console.log("✅ Usuário anonimo criado:", user);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin_at: new Date() },
    });
    console.log("📅 Atualizado lastLogin_at para anonimo");

    const token = jwt.sign(
      { userId: user.id, login: user.login },
      JWT_SECRET,
      { expiresIn: "7d" }
    );
    console.log("✅ Token anônimo gerado:", token.substring(0, 20) + "...");

    res.cookie("token", token, {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    console.log("🎉 Logou como anonimo");
    return res.status(200).json({ login: user.login, cargo: user.hierarquia });
  } catch (err) {
    console.error("❌ Erro no login anônimo:", err);
    return res.status(500).json({ error: "Erro interno no login anônimo" });
  }
}
