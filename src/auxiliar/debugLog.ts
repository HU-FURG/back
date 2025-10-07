
const IS_DEBUG_ENABLED = process.env.DEBUG_LOGS === 'true';

/**
 * Função de log condicional.
 * Só exibe a mensagem se DEBUG_LOGS for true.
 * @param {...any} args - Argumentos passados para console.log
 */
export const debugLog = (...args: any[]) => {
  // O console.log só é chamado se a flag for verdadeira
  if (IS_DEBUG_ENABLED) {
    console.log('[DEBUG]', ...args);
  }
};