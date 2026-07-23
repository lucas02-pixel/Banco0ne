
(function (global) {
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCXFhRZ_Byp40-sIxaNkyICoe066p6J04w",
    authDomain: "banco-sulegal-e93c5.firebaseapp.com",
    projectId: "banco-sulegal-e93c5",
    storageBucket: "banco-sulegal-e93c5.firebasestorage.app",
    messagingSenderId: "917084456664",
    appId: "1:917084456664:web:0fa0ecae429aded7cbb9ad",
    measurementId: "G-LTXPBFK5JV"
  };

  const RECAPTCHA_SITE_KEY = '6LcmYU4tAAAAAOFwL2zGX9VDOLRSOd0bfdzGyGgI';

  let db = null;
  let pronto = false;
  let estado = null; // { valor, destino, produto }
  let usuarioLogado = null; // { docId, nome, gix, saldo }
  let transacaoId = '';

  // ─── Carregamento dinâmico de scripts externos ───
  function carregarScript(src) {
    return new Promise((resolve, reject) => {
      if ([...document.scripts].some(s => s.src === src)) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Falha ao carregar ' + src));
      document.head.appendChild(s);
    });
  }

  async function garantirDependencias() {
    if (pronto) return;

    await carregarScript('https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js');
    await carregarScript('https://www.gstatic.com/firebasejs/9.22.1/firebase-app-check-compat.js');
    await carregarScript('https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore-compat.js');
    await carregarScript('https://cdnjs.cloudflare.com/ajax/libs/bcryptjs/2.4.3/bcrypt.min.js');
    await carregarScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
    await carregarScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');

    if (!firebase.apps || !firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
      const appCheck = firebase.appCheck();
      appCheck.activate(RECAPTCHA_SITE_KEY, true);
    }

    db = firebase.firestore();
    pronto = true;
  }

  // ─── Hash de senha — bcrypt, com migração automática (mesma lógica dos outros sites) ───
  function ehHashBcrypt(valor) {
    return typeof valor === 'string' && /^\$2[aby]\$\d{2}\$/.test(valor);
  }

  function pareceHash(valor) {
    return typeof valor === 'string' && /^[a-f0-9]{64}$/i.test(valor);
  }

  async function gerarHashSha256(nome, senha) {
    const textoComSal = nome.toLowerCase() + ':' + senha;
    const dados = new TextEncoder().encode(textoComSal);
    const bufferHash = await crypto.subtle.digest('SHA-256', dados);
    return Array.from(new Uint8Array(bufferHash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  function gerarHashBcrypt(senha) {
    return dcodeIO.bcrypt.hashSync(senha, 10);
  }

  function verificarBcrypt(senha, hashSalvo) {
    return dcodeIO.bcrypt.compareSync(senha, hashSalvo);
  }

  async function verificarEMigrarSenha(nome, senhaDigitada, senhaSalva, docId) {
    if (ehHashBcrypt(senhaSalva)) {
      return verificarBcrypt(senhaDigitada, senhaSalva);
    }
    if (pareceHash(senhaSalva)) {
      const hashCalc = await gerarHashSha256(nome, senhaDigitada);
      if (hashCalc !== senhaSalva) return false;
      const novoBcrypt = gerarHashBcrypt(senhaDigitada);
      db.collection('Contas').doc(docId).update({ senha: novoBcrypt }).catch(() => {});
      return true;
    }
    if (senhaSalva !== senhaDigitada) return false;
    const novoBcrypt = gerarHashBcrypt(senhaDigitada);
    db.collection('Contas').doc(docId).update({ senha: novoBcrypt }).catch(() => {});
    return true;
  }

  async function buscarPorGix(gix) {
    const snap = await db.collection('Contas').where('gix', '==', gix).limit(1).get();
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, data: d.data() };
  }

  // ─── Construção do modal (uma vez só) ───
  function montarModal() {
    if (document.getElementById('gixpay-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'gixpay-overlay';
    overlay.innerHTML = `
      <div class="gixpay-modal">
        <button class="gixpay-close" id="gixpay-close" aria-label="Fechar">×</button>

        <div class="gixpay-logo">GIX PAY</div>

        <div class="gixpay-step active" id="gixpay-step-login">
          <div class="gixpay-produto-box">
            <div class="gixpay-produto-nome" id="gixpay-produto-nome">—</div>
            <div class="gixpay-produto-valor"><span id="gixpay-produto-valor">0</span> sulegais</div>
          </div>
          <div class="gixpay-input-group">
            <input id="gixpay-gix-input" type="text" placeholder="Seu código GIX (ex: SUL123456)" />
          </div>
          <div class="gixpay-input-group">
            <input id="gixpay-senha-input" type="password" placeholder="Sua senha" />
          </div>
          <div class="gixpay-error" id="gixpay-login-error"></div>
          <button class="gixpay-btn-accent" id="gixpay-login-btn">Entrar →</button>
        </div>

        <div class="gixpay-step" id="gixpay-step-confirm">
          <div class="gixpay-user-box">
            <div class="gixpay-avatar" id="gixpay-avatar">?</div>
            <div>
              <div class="gixpay-user-nome" id="gixpay-user-nome">—</div>
              <div class="gixpay-user-saldo" id="gixpay-user-saldo">— sulegais</div>
            </div>
          </div>
          <div class="gixpay-confirm-row"><span>Produto</span><span id="gixpay-conf-produto">—</span></div>
          <div class="gixpay-confirm-row"><span>Destino (GIX)</span><span id="gixpay-conf-destino">—</span></div>
          <div class="gixpay-confirm-row gixpay-highlight"><span>Total</span><span id="gixpay-conf-valor">—</span></div>
          <div class="gixpay-error" id="gixpay-confirm-error"></div>
          <button class="gixpay-btn-accent" id="gixpay-confirm-btn">✓ Confirmar pagamento</button>
          <button class="gixpay-btn-ghost" id="gixpay-back-btn">← Trocar conta</button>
        </div>

        <div class="gixpay-step" id="gixpay-step-success">
          <div class="gixpay-success-icon">✅</div>
          <div class="gixpay-success-title">Pagamento confirmado!</div>
          <div class="gixpay-success-msg" id="gixpay-success-msg">—</div>
          <div class="gixpay-receipt-actions">
            <button class="gixpay-btn-secondary" id="gixpay-download-img">Baixar comprovante (imagem)</button>
            <button class="gixpay-btn-ghost" id="gixpay-finish-btn">Fechar</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('gixpay-close').addEventListener('click', fecharModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) fecharModal(); });

    document.getElementById('gixpay-login-btn').addEventListener('click', fazerLogin);
    document.getElementById('gixpay-confirm-btn').addEventListener('click', confirmarPagamento);
    document.getElementById('gixpay-back-btn').addEventListener('click', () => mostrarPasso('login'));
    document.getElementById('gixpay-finish-btn').addEventListener('click', fecharModal);
    document.getElementById('gixpay-download-img').addEventListener('click', baixarComprovante);

    document.getElementById('gixpay-senha-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') fazerLogin();
    });
  }

  function mostrarPasso(id) {
    document.querySelectorAll('#gixpay-overlay .gixpay-step').forEach(s => s.classList.remove('active'));
    document.getElementById('gixpay-step-' + id).classList.add('active');
  }

  function mostrarErro(id, msg) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.classList.add('show');
  }
  function ocultarErro(id) {
    document.getElementById(id).classList.remove('show');
  }

  function fecharModal() {
    document.getElementById('gixpay-overlay').classList.remove('open');
  }

  // ─── Login ───
  async function fazerLogin() {
    const gix = document.getElementById('gixpay-gix-input').value.trim().toUpperCase();
    const senha = document.getElementById('gixpay-senha-input').value.trim();
    ocultarErro('gixpay-login-error');

    if (!gix) return mostrarErro('gixpay-login-error', 'Informe seu GIX');
    if (!senha) return mostrarErro('gixpay-login-error', 'Informe sua senha');

    const btn = document.getElementById('gixpay-login-btn');
    btn.disabled = true;
    btn.textContent = 'Verificando...';

    try {
      const result = await buscarPorGix(gix);
      if (!result) { mostrarErro('gixpay-login-error', 'Conta não encontrada'); return; }

      const nomeConta = result.id;

      const senhaOk = await verificarEMigrarSenha(nomeConta, senha, result.data.senha, result.id);
      if (!senhaOk) {
        mostrarErro('gixpay-login-error', 'Senha incorreta');
        return;
      }

      if (gix === estado.destino) {
        mostrarErro('gixpay-login-error', 'Você não pode pagar para si mesmo');
        return;
      }

      usuarioLogado = { docId: result.id, nome: result.id, gix, saldo: Number(result.data.saldo) || 0 };

      document.getElementById('gixpay-avatar').textContent = usuarioLogado.nome[0].toUpperCase();
      document.getElementById('gixpay-user-nome').textContent = usuarioLogado.nome;
      document.getElementById('gixpay-user-saldo').textContent = usuarioLogado.saldo + ' sulegais';
      document.getElementById('gixpay-conf-produto').textContent = estado.produto;
      document.getElementById('gixpay-conf-destino').textContent = estado.destino;
      document.getElementById('gixpay-conf-valor').textContent = estado.valor + ' sulegais';

      const semSaldo = usuarioLogado.saldo < estado.valor;
      ocultarErro('gixpay-confirm-error');
      if (semSaldo) mostrarErro('gixpay-confirm-error', 'Saldo insuficiente para este pagamento.');
      document.getElementById('gixpay-confirm-btn').disabled = semSaldo;

      mostrarPasso('confirm');
    } catch (e) {
      console.error(e);
      mostrarErro('gixpay-login-error', 'Erro de conexão. Tente novamente.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Entrar →';
    }
  }

  // ─── Confirmar pagamento ───
  async function confirmarPagamento() {
    const btn = document.getElementById('gixpay-confirm-btn');
    btn.disabled = true;
    btn.textContent = 'Processando...';
    ocultarErro('gixpay-confirm-error');

    try {
      const destinoResult = await buscarPorGix(estado.destino);
      if (!destinoResult) throw new Error('Conta de destino não encontrada');

      const sRef = db.collection('Contas').doc(usuarioLogado.docId);
      const rRef = db.collection('Contas').doc(destinoResult.id);

      await db.runTransaction(async (t) => {
        const sSnap = await t.get(sRef);
        const rSnap = await t.get(rRef);
        if (!sSnap.exists || !rSnap.exists) throw new Error('Conta não encontrada');

        const saldoAtual = Number(sSnap.data().saldo) || 0;
        if (saldoAtual < estado.valor) throw new Error('Saldo insuficiente');

        t.update(sRef, { saldo: saldoAtual - estado.valor });
        t.update(rRef, { saldo: (Number(rSnap.data().saldo) || 0) + estado.valor });
      });

      await db.collection('avisos').add({
        gix: usuarioLogado.gix,
        nome: usuarioLogado.nome,
        produto: estado.produto,
        destino: estado.destino,
        total: estado.valor,
        origem: location.hostname,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });

      transacaoId = 'GX' + Date.now().toString().slice(-9);
      document.getElementById('gixpay-success-msg').innerHTML =
        `<b>${usuarioLogado.nome}</b> pagou <b>${estado.valor} sulegais</b> por "${estado.produto}".<br/><small>ID: ${transacaoId}</small>`;

      mostrarPasso('success');
    } catch (e) {
      console.error(e);
      const msg = e.message === 'Saldo insuficiente'
        ? 'Saldo insuficiente para este pagamento.'
        : 'Falha no pagamento. Tente novamente.';
      mostrarErro('gixpay-confirm-error', msg);
    } finally {
      btn.disabled = false;
      btn.textContent = '✓ Confirmar pagamento';
    }
  }

  async function baixarComprovante() {
    const el = document.querySelector('#gixpay-step-success');
    const canvas = await html2canvas(el, { backgroundColor: '#0b0f1a', scale: 2 });
    const link = document.createElement('a');
    link.download = `comprovante-${transacaoId}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  // ─── API pública ───
  async function abrir(opts) {
    const { valor, destino, produto } = opts || {};

    if (!valor || valor <= 0) { console.error('GixPay: "valor" inválido'); return; }
    if (!destino) { console.error('GixPay: "destino" (GIX) é obrigatório'); return; }

    await garantirDependencias();
    montarModal();

    estado = { valor: Number(valor), destino: String(destino).toUpperCase(), produto: produto || 'Compra' };
    usuarioLogado = null;

    document.getElementById('gixpay-gix-input').value = '';
    document.getElementById('gixpay-senha-input').value = '';
    ocultarErro('gixpay-login-error');
    document.getElementById('gixpay-produto-nome').textContent = estado.produto;
    document.getElementById('gixpay-produto-valor').textContent = estado.valor;

    mostrarPasso('login');
    document.getElementById('gixpay-overlay').classList.add('open');
  }

  global.GixPay = { open: abrir };
})(window);
