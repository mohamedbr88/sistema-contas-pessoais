// Base inicial pessoal removida do código público.
// Os dados já importados permanecem no Supabase da conta proprietária.
export const BASE = { tx: [], fixos: [], viagens: [] };
export async function importarBase(){ throw new Error('Importação da base inicial desativada.'); }
export const temBase = () => true;
