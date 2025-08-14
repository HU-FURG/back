import { Request, Response } from 'express';
import { prisma } from '../prisma/client';
import { z } from 'zod';
import jwt from 'jsonwebtoken';

const loginSchema = z.object({
  login: z.string(),
  senha: z.string(),
});

// segredo do JWT (melhor guardar em .env)
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

export async function login(req: Request, res: Response) {
  try {
    const { login, senha } = loginSchema.parse(req.body);

    // verifica se o usuário existe
    const user = await prisma.user.findUnique({
      where: { login },
    });

    if (!user) {
      return res.status(401).json({ error: 'Login ou senha incorretos' });
    }

    // hash em breve
    if (!user || user.senha !== senha) {
      return res.status(401).json({ error: 'Login ou senha incorretos' });
    }

    // gera token JWT válido por 24h
    const token = jwt.sign(
      { userId: user.id, login: user.login, hierarquia: user.hierarquia },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.status(200).json({ token });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }

    console.error('Erro ao logar:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}