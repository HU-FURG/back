import { Request, Response } from 'express';
import { prisma } from '../prisma/client';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import bcrypt from "bcrypt";
import { Hierarquia } from '@prisma/client';

const loginSchema = z.object({
  login: z.string(),
  senha: z.string(),
  remember: z.boolean()
});

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

export async function login(req: Request, res: Response) {
  try {
    console.log(" Requisição de login recebida:", req.body);

    const { login, senha, remember } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { login, active: true },
    });

    console.log(" Usuário encontrado no banco:", user);

    if (!user) {
      console.warn(" Usuário não existe:", login);
      return res.status(401).json({ error: 'Login ou senha incorretos' });
    }

    const senhaValida = await bcrypt.compare(senha, user.senha);
    console.log("Senha válida?", senhaValida);

    if (!senhaValida) {
      console.warn(" Senha inválida para usuário:", login);
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
    console.log("Token JWT gerado:", token.substring(0, 20) + "...");

    const isProduction = process.env.NODE_ENV === "production";

    res.cookie('token', token, {
      httpOnly: true,
      secure: isProduction,             // só HTTPS em produção
      sameSite: isProduction ? 'lax' : 'lax', // em produção = Lax (primeira parte), dev pode ser Lax também
      maxAge: remember ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000,
    });

    const cargo = user.hierarquia;
  
    console.log("Login bem sucedido:", { login, cargo  });

    return res.status(200).json({ login, cargo, nome: user.nome });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("❌ Erro de validação no login:", error.errors);
      return res.status(400).json({ errors: error.errors });
    }

    console.error('❌ Erro ao logar:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}

export async function loginAnonimo(req: Request, res: Response) {//verificado
  try {
    console.log("👤 Login anônimo solicitado");

    const anonLogin = "anonimo";
    const anonSenha = "1234";

    let user = await prisma.user.findUnique({ where: { login: anonLogin } });
    console.log(" Usuário anonimo encontrado?", !!user);

    if (!user) {
      console.log("Criando usuário anonimo...");
      const hashedPassword = await bcrypt.hash(anonSenha, 10);
      user = await prisma.user.create({
        data: { login: anonLogin, senha: hashedPassword, hierarquia: "admin", nome: "Usuário Anônimo" },
      });
      console.log(" Usuário anonimo criado:", user);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin_at: new Date() },
    });
    
    console.log("Atualizado lastLogin_at para anonimo");

    const token = jwt.sign(
      { userId: user.id, login: user.login },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    console.log(" Token anônimo gerado:", token.substring(0, 20) + "...");

    res.cookie("token", token, {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    console.log("Logou como anonimo");
    const obj = {
      login: user.login,
      cargo: user.hierarquia
    }
    return res.status(200).json(obj);
  } catch (err) {
    console.error(" Erro no login anônimo:", err);
    return res.status(500).json({ error: "Erro interno no login anônimo" });
  }
}

export async function validateToken(req: Request, res: Response) {
  const { login } = (req as any).user;
  console.log("🔐 Token validado para:", login);
  const data = await prisma.user.findUnique({
      where: { login, active: true },
      select: {hierarquia: true}
    });

  if (!data) {
    return res.status(403).json({ valid: false });
  }
  
  res.json({ valid: true, login, cargo: data?.hierarquia });
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
  login: z.string().min(3),
  senha: z.string().min(6),
  cargo: z.enum(["admin", "user"]),
  nome: z.string().optional(),
  email: z.string().email().optional(),
  especialidadeId: z.number().optional(),
  descricao: z.string().optional(),
  telefone: z.string().optional(),
})


export async function createUser(req: Request, res: Response) {
  try {
    console.log("Criando usuário:", req.body)

    const {
      login,
      senha,
      cargo,
      nome,
      email,
      especialidadeId,
      descricao,
      telefone,
    } = createUserSchema.parse(req.body)

    // 🔎 login duplicado
    const existingLogin = await prisma.user.findUnique({
      where: { login },
    })

    if (existingLogin) {
      return res
        .status(400)
        .json({ error: "Usuário já existe" })
    }

    const exitingSpecialidade = especialidadeId
      ? await prisma.especialidadeUser.findUnique({
          where: { id: especialidadeId },
        })
      : false
    
    if (especialidadeId && !exitingSpecialidade) {
      return res
        .status(400)
        .json({ error: "Especialidade não existe" })
    }

    let especialidadeIdAdmin: number | undefined = undefined;

    if (cargo === "admin") {
      especialidadeIdAdmin = await prisma.especialidadeUser.findFirst({
        where: { nome: "Administrador" },
      }).then(e => e?.id)
    }

    // 🔎 email duplicado
    if (email) {
      const existingEmail =
        await prisma.user.findUnique({
          where: { email },
        })

      if (existingEmail) {
        return res
          .status(400)
          .json({ error: "E-mail já está em uso" })
      }
    }

    let hashedPassword: string;

    // 🔐 hash da senha
    if (cargo === "user") {
      hashedPassword = await bcrypt.hash("hospital", 10)
    }
    else {
      hashedPassword = await bcrypt.hash(senha, 10)
    }

    // 🧠 hierarquia
    const hierarquia =
      cargo === "admin"
        ? Hierarquia.admin
        : Hierarquia.user

    const newUser = await prisma.user.create({
      data: {
        login,
        senha: hashedPassword,
        hierarquia,
        nome: nome || login,
        email,
        telefone,
        descricao,
        active: true,
        especialidadeId:
          hierarquia === Hierarquia.admin
            ? especialidadeIdAdmin
            : especialidadeId ?? null,
      },
      include: {
        especialidade: true,
      },
    })

    console.log(
      "Usuário criado:",
      newUser.login,
      "-",
      newUser.hierarquia,
    )

    return res.status(201).json(newUser)
  } catch (err) {
    console.error("Erro ao criar usuário:", err)

    if (err instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: err.errors })
    }

    return res
      .status(500)
      .json({ error: "Erro interno no servidor" })
  }
}


// export async function removeUser(req: Request, res: Response) { //verificado
//   try {
//     console.log("Removendo usuário:", req.body);

//     // 🔒 Validação segura
//     const schema = z.object({
//       login: z.string().min(1, "Login é obrigatório"),
//       force: z.boolean().optional(),
//     });

//     const parsed = schema.safeParse(req.body);

//     if (!parsed.success) {
//       return res
//         .status(400)
//         .json({ error: parsed.error.errors[0].message });
//     }

//     const { login, force } = parsed.data;

//     // 🔎 Busca usuário
//     const user = await prisma.user.findUnique({ where: { login } });
//     if (!user) {
//       console.warn("⚠️ Usuário não encontrado:", login);
//       return res.status(404).json({ error: "Usuário não encontrado" });
//     }

//     // 🔍 Verifica reservas ativas
//     const reservasAtivas = await prisma.roomPeriod.findMany({
//       where: { userId: user.id, end: { gte: new Date() } },
//       include: { room: true },
//     });

//     // ❗ Se tiver reservas e não for "force", retorna aviso
//     if (reservasAtivas.length > 0 && !force) {
//       return res.status(400).json({
//         error:
//           "Usuário possui reservas ativas. Use 'force: true' para cancelar e remover.",
//       });
//     }

//     // ⚙️ Se for force, arquiva reservas antes de apagar
//     if (reservasAtivas.length > 0 && force) {
//       console.log(`⚠️ Cancelando ${reservasAtivas.length} reservas do usuário...`);

//       const templates = reservasAtivas.map((r) => {
//         const durationInMinutes =
//           (r.end.getTime() - r.start.getTime()) / (1000 * 60);

//         return {
//           userId: r.userId,
//           nome: r.nome,
//           durationInMinutes,
//           roomIdAmbiente: r.room?.ID_Ambiente ?? "Desconhecido",
//           roomBloco: r.room?.bloco ?? "Desconhecido",
//           originalStart: r.start,
//           originalEnd: r.end,
//           reason: "Cancelado por remoção de usuário",
//         };
//       });

//       // 🔄 Usa transação para garantir consistência
//       await prisma.$transaction([
//         prisma.roomScheduleTemplate.createMany({ data: templates }),
//         prisma.roomPeriod.deleteMany({ where: { userId: user.id } }),
//       ]);

//       console.log("🗑️ Reservas movidas e removidas com sucesso.");
//     }

//     // 🧍‍♂️ Desativa o usuário
//     await prisma.user.update({
//       where: { login },
//       data: { active: false },
//     });

//     console.log("✅ Usuário removido:", login);
//     res.json({ success: true, login });
//   } catch (err) {
//     console.error("❌ Erro ao remover usuário:", err);
//     res.status(500).json({ error: "Erro interno ao remover usuário" });
//   }
// }

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
  try {
    const schema = z.object({
      query: z.string().min(1),
    })

    const { query } = schema.parse(req.query)

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
    })

    return res.json(
      users.map((u) => ({
        id: u.id,
        nome: u.nome ?? u.login,
        login: u.login,
        especialidade: u.especialidade?.nome ?? "—",
      }))
    )
  } catch (err) {
    console.error("Erro ao buscar usuários:", err)
    return res.status(500).json({
      error: "Erro interno ao buscar usuários",
    })
  }
}

export async function getUsers(req: Request, res: Response) {// verificado {falta pages}
  try {
    const users = await prisma.user.findMany({
      where: { hierarquia: { not: "admin" } },
      select: { ...publicUserSelect },
    });

    console.log("✅ Usuários encontrados:", users);
    res.json(users);
  } catch (err) {
    console.error("❌ Erro ao buscar usuários:", err);
    res.status(500).json({ error: "Erro interno" });
  }
}

export async function getMyProfile(req: Request, res: Response) {
  try {
    const { login } = (req as any).user;
    console.log("Buscando perfil do usuário:", login);

    const user = await prisma.user.findUnique(
      { where:{login},
        include: {especialidade: {
        select: { nome: true },
      },}
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
      especialidade: {nome: user.especialidade?.nome ?? "—"},
      lastLogin_at: user.lastLogin_at,
      active: user.active,
    });
  } catch (err) {
    console.error("Erro ao buscar perfil do usuário:", err);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
}

export async function updateProfile(req: Request, res: Response) {
  try {
    const { login } = (req as any).user;
    const {
      nome,
      email,
      telefone,
      descricao,
      newPassword,   
    } = req.body;

    console.log("Tentando atualizar perfil de:", login);

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
    if( !newPassword ) {
      if (nome !== undefined && nome !== user.nome) {
        dataToUpdate.nome = nome; // pode ser ""
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

        dataToUpdate.email = email; // pode ser ""
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
    const updatedUser = await prisma.user.update({
      where: { login },
      data: dataToUpdate,
    });

    console.log("Perfil atualizado com sucesso:", login);

    return res.status(200).json({
      message: "Perfil atualizado com sucesso!",
    });

  } catch (err) {
    console.error("Erro ao atualizar perfil:", err);
    return res.status(500).json({
      error: "Erro interno ao atualizar perfil.",
    });
  }
}
// verifica email automatico