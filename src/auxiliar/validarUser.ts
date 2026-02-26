// src/utils/validateUserPayload.ts
import { Response } from "express"
import { prisma } from "../prisma/client"

type ValidateUserOptions = {
  mode: "create" | "edit"
  userId?: number
}

export async function validateUserPayload(
  data: any,
  res: Response,
  options: ValidateUserOptions,
) {
  const { mode, userId } = options

  // ===============================
  // SENHA → só no CREATE
  // ===============================
  if (mode === "create") {
    if (!data.senha || data.senha.length < 6) {
      res.status(400).json({
        field: "senha",
        message: "Senha deve ter no mínimo 6 caracteres",
      })
      return null
    }
  }

  // ===============================
  // TELEFONE → normaliza
  // ===============================
  if (data.telefone) {
    const onlyNumbers = data.telefone.replace(/\D/g, "")

    if (onlyNumbers.length < 8) {
      res.status(400).json({
        field: "telefone",
        message: "Telefone inválido",
      })
      return null
    }

    data.telefone = onlyNumbers
  }

  // ===============================
  // EMAIL DUPLICADO
  // ===============================
  if (data.email) {
    const emailExists = await prisma.user.findFirst({
      where: {
        email: data.email,
        ...(mode === "edit" && userId
          ? { NOT: { id: userId } }
          : {}),
      },
    })

    if (emailExists) {
      res.status(409).json({
        field: "email",
        message: "Email já está em uso",
      })
      return null
    }
  }

  // ===============================
  // HIERARQUIA / ESPECIALIDADE
  // ===============================
  if (data.hierarquia === "admin") {
    const especialidadeAdmin =
      await prisma.especialidadeUser.findUnique({
        where: { nome: "Administrador" },
      })

    if (!especialidadeAdmin) {
      res.status(500).json({
        message: "Especialidade Administrador não encontrada",
      })
      return null
    }

    data.especialidadeId = especialidadeAdmin.id
  }

  if (data.hierarquia === "user" && !data.especialidadeId) {
    res.status(400).json({
      field: "especialidadeId",
      message:
        "Usuários não administrativos devem ter uma especialidade definida",
    })
    return null
  }

  return data
}
