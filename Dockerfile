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

# Gera cliente do Prisma
RUN npx prisma generate

# Compila TypeScript para JavaScript
RUN npm run build


# Etapa 2: Imagem final
FROM node:20-alpine

WORKDIR /app

# Copia somente o necessário
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/dist ./dist

# Porta usada pelo Express
EXPOSE 3000

# Comando para iniciar
CMD ["node", "dist/index.js"]
