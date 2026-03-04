// utils/asyncHandler.ts
import { Request, Response, NextFunction } from "express";

export const asyncHandler =
  (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

// middlewares/errorHandler.ts
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  console.error(err);

  // Zod
  if (err instanceof ZodError) {
    return res.status(400).json({
      message: "Dados inválidos",
      errors: err.errors,
    });
  }

  // Prisma known errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return res.status(400).json({
      message: "Erro de banco de dados",
      code: err.code,
    });
  }

  return res.status(500).json({
    message: "Erro interno no servidor",
  });
}
