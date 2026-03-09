// src/app.ts
import "dotenv/config";
import express from "express";
import cors from "cors";
import cron from "node-cron";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import path from "path";

// routes
import dashboardRoutes from "./routes/dashboardRoutes";
import roomRoutes from "./routes/roomRoutes";
import periodRoutes from "./routes/periodRoutes";
import userRoutes from "./routes/userRoutes";
import schedulingRoutes from "./routes/schedulingRouter";
import rescheduleRouter from "./routes/rescheduleRouter";
import configRoutes from "./routes/configRoutes";
import monitorRoutes from "./routes/monitoramentoRoutes";
import mapRoutes from "./routes/mapsRoutes";

// routine
import { clear } from "./prisma/clear";
import { getSystemLog } from "./prisma/systemLog";
import { errorHandler } from "./middlewares/errorHandler";

const app = express();

app.use(express.json());

app.use(express.static(path.join(__dirname, "../public")));
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3333",
  "https://sgs.hu-furg.ebserh",
  "https://precious-reyna-hu-furg-b9ddc9e2.koyeb.app",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true); // permite Postman / server-to-server

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"],
    allowedHeaders: ["Content-Type", "Authorization", "If-None-Match"],
    exposedHeaders: ["ETag"],
    credentials: true,
  }),
);
app.use(cookieParser());

morgan.token("body", (req: any) => JSON.stringify(req.body));

app.use(morgan(":method :url :status :response-time ms - body=:body"));

app.use("/api", roomRoutes); // Salas
app.use("/api", periodRoutes); // Agendamentos
app.use("/api", userRoutes); // sistema login get users CRUD usuarios
app.use("/api", dashboardRoutes); // dashboard
app.use("/api/config", configRoutes); // dashboard
app.use("/api/scheduling", schedulingRoutes); // gerenciamento de agendamentos
app.use("/api/maps", mapRoutes); // gerenciamento de mapas

app.use("/api/monitor", monitorRoutes); // monitoramento
app.use("/api/reschedule", rescheduleRouter); // reprogramação de agendamentos

app.get("/health", (req, res) => res.sendStatus(200)); // rota de verificação de deploy

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public", "index.html"));
});

app.use(errorHandler);

const PORT = Number(process.env.PORT) || 3333;
app.listen(PORT, "0.0.0.0", async () => {
  console.log(`Servidor rodando...`);

  try {
    const log = await getSystemLog("last_clear_update");
    const lastRun = log?.updatedAt ?? new Date(0);
    const diffHours = (Date.now() - lastRun.getTime()) / (1000 * 60 * 60);

    if (diffHours >= 24) {
      await clear();
    }
  } catch (err) {
    console.error("Erro no startup:", err);
  }

  cron.schedule("59 23 * * *", async () => {
    try {
      await clear();
    } catch (err) {
      console.error("Erro no cron:", err);
    }
  });
});
