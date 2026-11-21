import { Txt2ImgWorkerClient } from 'web-txt2img';

const get = id => document.getElementById(id);
const status = get('status');
const button = get('generate');
const image = get('image');
const result = get('result');
const model = 'sd-turbo';
let client, imageUrl, workerFailure;
let loaded = false;

function getClient() {
  if (client) return client;
  client = Txt2ImgWorkerClient.createDefault();
  workerFailure = new Promise((_, reject) => {
    for (const event of ['error', 'messageerror']) {
      client.worker.addEventListener(event, () => reject(new Error('O navegador interrompeu o motor de geração.')), { once: true });
    }
  });
  workerFailure.catch(() => {});
  return client;
}

async function checkGPU() {
  try {
    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter) throw new Error('WebGPU indisponível neste aparelho ou navegador.');
    if (!adapter.features.has('shader-f16')) throw new Error('A GPU deste navegador não oferece shader-f16 para o SD-Turbo.');
    get('engine').textContent = 'WebGPU disponível. O modelo ainda precisa ser carregado.';
    button.disabled = false;
  } catch (error) {
    get('engine').textContent = error.message;
  }
}

get('form').addEventListener('submit', async event => {
  event.preventDefault();
  const prompt = get('prompt').value.trim();
  if (!prompt || button.disabled) return;
  const seed = get('seed').value ? get('seed').valueAsNumber : crypto.getRandomValues(new Uint32Array(1))[0];
  button.disabled = true;
  status.hidden = false;
  result.hidden = image.hidden = true;
  try {
    const runtime = getClient();
    if (!loaded) {
      status.textContent = 'Preparando o modelo. Mantenha esta aba aberta.';
      const load = runtime.load(model, { backendPreference: ['webgpu'] }, update => {
        const percent = Number.isFinite(update.pct) ? ' ' + Math.round(update.pct) + '%' : '';
        status.textContent = 'Carregando SD-Turbo…' + percent;
      });
      const state = await Promise.race([load, workerFailure]);
      if (!state.ok) throw new Error(state.message || 'Não foi possível carregar o modelo neste navegador.');
      loaded = true;
    }
    status.textContent = 'Gerando a imagem neste aparelho…';
    const task = runtime.generate({ model, prompt, seed, width: 512, height: 512 });
    const output = await Promise.race([task.promise, workerFailure]);
    const generated = output.data ?? output;
    if (!generated.ok || !(generated.blob instanceof Blob)) throw new Error(generated.message || 'A geração falhou.');
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = URL.createObjectURL(generated.blob);
    image.src = get('download').href = imageUrl;
    await image.decode();
    get('info').textContent = 'Semente ' + seed;
    result.hidden = image.hidden = false;
    status.hidden = true;
  } catch (error) {
    client?.terminate();
    client = undefined;
    loaded = false;
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
checkGPU();
