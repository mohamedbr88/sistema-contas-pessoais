// Quebra o ciclo de imports: as telas chamam render() sem importar o app.js.
let _render = () => {};
export function setRender(f) { _render = f; }
export function render() { _render(); }
