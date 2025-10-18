// src/middlewares/cache.ts

import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import { prisma } from '../prisma/client';

/**
 * Gera uma string que representa o estado atual da tabela de salas.
 * @returns {Promise<string | null>} Uma string de estado ou null se não houver salas.
 */
const getRoomsState = async (): Promise<string | null> => {
  // Otimização: Fazemos todas as consultas de metadados em uma única chamada ao banco
  const roomAggregates = await prisma.room.aggregate({
    _count: {
      _all: true,
    },
    _max: {
      createdAt: true,
      updatedAt: true,
    },
  });

  const count = roomAggregates._count._all;

  if (count === 0) {
    return 'no-rooms'; // Um estado fixo para quando não há salas
  }

  const lastCreated = roomAggregates._max.createdAt?.toISOString();
  const lastUpdated = roomAggregates._max.updatedAt?.toISOString();

  // A "impressão digital" da nossa tabela
  return `count:${count}-created:${lastCreated}-updated:${lastUpdated}`;
};

/**
 * Middleware para verificar o cache de salas usando ETag.
 * Se o cache do cliente for válido, retorna 304 Not Modified.
 * Caso contrário, prossegue para a próxima função na rota.
 */
export const checkRoomUpdates = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 1. Obter o "estado" atual do banco de dados
    const currentState = await getRoomsState();

    // 2. Gerar o ETag a partir do estado atual
    const etag = createHash('md5').update(currentState || '').digest('hex');

    // 3. Obter o ETag que o cliente enviou (se houver)
    const clientEtag = req.headers['if-none-match'];

    // 4. Comparar os ETags
    if (clientEtag === etag) {
      return res.status(304).send();
    }

    // 5. Se os dados mudaram, anexamos o novo ETag na resposta
    // e passamos para a rota principal (ex: buscar todas as salas).
    console.log("ta chegando aqui ?", etag)
    res.setHeader('ETag', etag);
    next(); // Continua para o próximo handler da rota

  } catch (error) {
    // Em caso de erro, passamos para o handler de erro do Express
    next(error);
  }
};