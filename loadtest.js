import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 50, // usuários simultâneos
  duration: "1m", // duração do teste
};
// export const options = {
//   vus: 1, // 1 usuário virtual
//   iterations: 1, // executa apenas 1 vez
// };

const BASE_URL = "http://localhost:3333/api";

export default function () {
  // ==========================
  // 1️⃣ LOGIN
  // ==========================
  const loginPayload = JSON.stringify({
    login: "admin",
    senha: "admin",
    remember: false,
  });

  const loginParams = {
    headers: {
      "Content-Type": "application/json",
    },
  };

  const loginRes = http.post(`${BASE_URL}/login`, loginPayload, loginParams);

  console.log("STATUS LOGIN:", loginRes.status);
  console.log("BODY LOGIN:", loginRes.body);
  console.log("COOKIES:", JSON.stringify(loginRes.cookies));

  check(loginRes, {
    "login status 200": (r) => r.status === 200,
  });

  // Captura cookie automaticamente
  const cookies = loginRes.cookies;

  // ==========================
  // 2️⃣ BUSCAR SALAS
  // ==========================
  const salasPayload = JSON.stringify({
    userId: 1,
    horarios: [
      {
        data: "2026-03-10",
        horaInicio: "08:00",
        horaFim: "10:00",
      },
    ],
    recorrente: false,
    maxTimeRecorrente: "",
    lastRoomId: -1,
    numeroSala: "",
    bloco: null,
    tipo: "all",
    especialidadeRoom: null,
  });

  const salasParams = {
    headers: {
      "Content-Type": "application/json",
    },
    cookies: {
      token: loginRes.cookies.token[0].value,
    },
  };

  const salasRes = http.post(
    `${BASE_URL}/buscarhorario`,
    salasPayload,
    salasParams,
  );

  check(salasRes, {
    "buscar salas status 200": (r) => r.status === 200,
  });

  sleep(1);
}
