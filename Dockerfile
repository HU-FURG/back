# Etapa 1: Build da aplicação
FROM node:20 AS builder

WORKDIR /app

# Copia pacotes e instala dependências
COPY package*.json ./
COPY prisma ./prisma/
COPY tsconfig.json ./
RUN npm install

# Copia o código fonte
COPY src ./src

# Gera cliente do Prisma com linux-musl (para Alpine/Koyeb)
RUN npx prisma generate

# Compila TypeScript para JavaScript
RUN npm run build

# Etapa 2: Imagem final leve
FROM node:20-alpine

WORKDIR /app

# Copia dependências, build e Prisma
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/dist ./dist

# Porta dinâmica (usada pelo Koyeb)
EXPOSE 3000

# Comando para iniciar
CMD ["node", "dist/app.js"]
