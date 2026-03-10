import { Request, Response } from "express";
import { prisma } from "../prisma/client";
import { z } from "zod";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { Hierarquia } from "@prisma/client";

const loginSchema = z.object({
  login: z.string(),
  senha: z.string(),
  remember: z.boolean(),
});

const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

export const login = async (req: Request, res: Response) => {
  const { login, senha, remember } = loginSchema.parse(req.body);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const loginRegex = /^[a-zA-Z0-9.]+$/;

  let user = null;

  // se for email
  if (emailRegex.test(login)) {
    user = await prisma.user.findUnique({
      where: { email: login.toLowerCase() },
    });
  }

  // se não encontrou ou não era email → tenta login
  if (!user) {
    if (!loginRegex.test(login)) {
      return res.status(400).json({
        error: {
          code: "INVALID_LOGIN_FORMAT",
          message: "Login contém caracteres inválidos",
        },
      });
    }

    user = await prisma.user.findUnique({
      where: { login: login.toLowerCase() },
    });
  }

  if (!user) {
    return res.status(401).json({
      error: {
        code: "INVALID_CREDENTIALS",
        message: "Login ou senha incorretos",
      },
    });
  }

  const senhaValida = await bcrypt.compare(senha, user.senha);

  if (!senhaValida) {
    return res.status(401).json({
      error: {
        code: "INVALID_CREDENTIALS",
        message: "Login ou senha incorretos",
      },
    });
  }

  if (!user.active) {
    return res.status(401).json({
      error: {
        code: "USER_DISABLED",
        message: "Usuário desativado",
      },
    });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLogin_at: new Date() },
  });

  const token = jwt.sign(
    { userId: user.id, login: user.login, hierarquia: user.hierarquia },
    JWT_SECRET,
    {
      expiresIn: remember ? "30d" : "24h",
    },
  );

  const isProduction = process.env.NODE_ENV === "production";

  res.cookie("token", token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: remember ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000,
  });

  return res.status(200).json({
    login: user.login,
    cargo: user.hierarquia,
    nome: user.nome,
  });
};
export async function validateToken(req: Request, res: Response) {
  const { login } = (req as any).user;
  console.log("🔐 Token validado para:", login);
  const data = await prisma.user.findUnique({
    where: { login, active: true },
    select: { hierarquia: true },
  });

  if (!data) {
    return res.status(403).json({ valid: false });
  }

  res.json({ valid: true, login, cargo: data.hierarquia });
}

export function logout(req: Request, res: Response) {
  try {
    res.clearCookie("token", {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return res
      .status(200)
      .json({ success: true, message: "Logout realizado com sucesso" });
  } catch (err) {
    console.error("❌ Erro no logout:", err);
    return res.status(500).json({ error: "Erro interno no logout" });
  }
}

const createUserSchema = z.object({
  login: z.string().min(3),
  senha: z.string().min(6),
  cargo: z.enum(["admin", "user", "boss"]),
  nome: z.string().optional(),
  email: z.string().email().optional(),
  especialidadeId: z.number().optional(),
  descricao: z.string().optional(),
  telefone: z.string().optional(),
});

export async function createUser(req: Request, res: Response) {
  try {
    const {
      login,
      senha,
      cargo,
      nome,
      email,
      especialidadeId,
      descricao,
      telefone,
    } = createUserSchema.parse(req.body);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const loginRegex = /^[a-zA-Z0-9.]+$/;

    // 🔒 valida login
    if (!loginRegex.test(login)) {
      return res.status(400).json({
        error: "Login só pode conter letras, números e ponto",
      });
    }

    // 🔒 valida email
    if (email && !emailRegex.test(email)) {
      return res.status(400).json({
        error: "E-mail inválido",
      });
    }

    const existingLogin = await prisma.user.findUnique({
      where: { login },
    });

    if (existingLogin) {
      return res.status(400).json({ error: "Usuário já existe" });
    }

    console.log("xiste");

    if (email) {
      const existingEmail = await prisma.user.findUnique({
        where: { email: email },
      });

      if (existingEmail) {
        return res.status(400).json({ error: "E-mail já está em uso" });
      }
    }

    let hashedPassword: string;

    if (cargo === "user") {
      hashedPassword = await bcrypt.hash("hospital", 10);
    } else {
      hashedPassword = await bcrypt.hash(senha, 10);
    }

    const hierarquia = cargo === "admin" ? Hierarquia.admin : Hierarquia.user;

    const newUser = await prisma.user.create({
      data: {
        login,
        senha: hashedPassword,
        hierarquia,
        nome: nome || login,
        email: email ?? null,
        telefone,
        descricao,
        active: true,
        especialidadeId: especialidadeId ?? null,
      },
      include: {
        especialidade: true,
      },
    });

    return res.status(201).json(newUser);
  } catch (error: any) {
    // 🔴 erro de campo único (login ou email duplicado)
    if (error.code === "P2002") {
      const field = error.meta?.target?.[0];

      if (field === "email") {
        return res.status(400).json({ error: "E-mail já está em uso" });
      }

      if (field === "login") {
        return res.status(400).json({ error: "Login já está em uso" });
      }

      return res.status(400).json({ error: "Valor duplicado" });
    }

    console.error(error);

    return res.status(500).json({
      error: "Erro interno ao criar usuário",
    });
  }
}

const publicUserSelect = {
  id: true,
  login: true,
  senha: false,
  nome: true,
  hierarquia: true,
  especialidadeId: true,
  telefone: true,
  email: true,
  lastLogin_at: true,
  active: true,
  descricao: true,
};

export async function searchUsers(req: Request, res: Response) {
  const schema = z.object({
    query: z.string().min(1),
  });

  const { query } = schema.parse(req.query);

  const users = await prisma.user.findMany({
    where: {
      active: true,
      hierarquia: { not: "admin" },
      OR: [
        { nome: { contains: query, mode: "insensitive" } },
        { login: { contains: query, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      nome: true,
      login: true,
      especialidade: {
        select: { nome: true },
      },
    },
    orderBy: { nome: "asc" },
    take: 5,
  });

  return res.json(
    users.map((u) => ({
      id: u.id,
      nome: u.nome ?? u.login,
      login: u.login,
      especialidade: u.especialidade?.nome ?? "—",
    })),
  );
}

export async function getUsers(req: Request, res: Response) {
  const users = await prisma.user.findMany({
    where: { hierarquia: { not: "admin" } },
    select: { ...publicUserSelect },
  });

  console.log("✅ Usuários encontrados:", users);
  res.json(users);
}

export async function getMyProfile(req: Request, res: Response) {
  const { login } = (req as any).user;
  console.log("Buscando perfil do usuário:", login);

  const user = await prisma.user.findUnique({
    where: { login },
    include: {
      especialidade: {
        select: { nome: true },
      },
    },
  });

  if (!user) {
    console.warn("Usuário não encontrado:", login);
    return res.status(404).json({ error: "Usuário não encontrado" });
  }

  return res.status(200).json({
    login: user.login,
    nome: user.nome,
    email: user.email,
    telefone: user.telefone,
    descricao: user.descricao,
    hierarquia: user.hierarquia,
    especialidade: { nome: user.especialidade?.nome ?? "—" },
    lastLogin_at: user.lastLogin_at,
    active: user.active,
  });
}

export async function updateProfile(req: Request, res: Response) {
  const { login } = (req as any).user;
  const { nome, email, telefone, descricao, newPassword } = req.body;

  // console.log("Tentando atualizar perfil de:", login);

  const user = await prisma.user.findUnique({
    where: { login },
  });

  if (!user) {
    return res.status(404).json({ error: "Usuário não encontrado." });
  }

  const dataToUpdate: any = {};

  /* ===============================
      NOME
    ================================ */
  if (!newPassword) {
    if (nome !== undefined && nome !== user.nome) {
      dataToUpdate.nome = nome;
    }
    console.log("Nome atualizado para:", nome);
    /* ===============================
        EMAIL
      ================================ */
    if (email !== undefined && email !== user.email) {
      if (email !== "") {
        const emailExists = await prisma.user.findFirst({
          where: {
            email,
            NOT: { login },
          },
        });

        if (emailExists) {
          return res.status(400).json({
            error: "Este e-mail já está em uso.",
          });
        }
      }

      dataToUpdate.email = email;
    }

    /* ===============================
        TELEFONE
      =============================== */
    if (telefone !== undefined && telefone !== user.telefone) {
      dataToUpdate.telefone = telefone;
    }

    /* ===============================
        DESCRIÇÃO
      =============================== */
    if (descricao !== undefined && descricao !== user.descricao) {
      dataToUpdate.descricao = descricao;
    }
  } else {
    /* ===============================
            SENHA
          =============================== */
    if (newPassword) {
      if (newPassword.length < 6) {
        return res.status(400).json({
          error: "A nova senha deve ter pelo menos 6 caracteres.",
        });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      dataToUpdate.senha = hashedPassword; // CORRIGIDO AQUI
    }
  }

  /* ===============================
       NADA PARA ATUALIZAR
    =============================== */
  if (Object.keys(dataToUpdate).length === 0) {
    return res.status(400).json({
      message: "Nenhum dado para atualizar.",
    });
  }

  /* ===============================
       UPDATE
    =============================== */
  await prisma.user.update({
    where: { login },
    data: dataToUpdate,
  });

  console.log("Perfil atualizado com sucesso:", login);

  return res.status(200).json({
    message: "Perfil atualizado com sucesso!",
  });
}
