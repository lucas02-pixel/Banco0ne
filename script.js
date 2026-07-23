// ============================================================
// FIREBASE
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyCXFhRZ_Byp40-sIxaNkyICoe066p6J04w",
  authDomain: "banco-sulegal-e93c5.firebaseapp.com",
  projectId: "banco-sulegal-e93c5",
  storageBucket: "banco-sulegal-e93c5.firebasestorage.app",
  messagingSenderId: "917084456664",
  appId: "1:917084456664:web:0fa0ecae429aded7cbb9ad",
  measurementId: "G-LTXPBFK5JV"
};

firebase.initializeApp(firebaseConfig);

const appCheck = firebase.appCheck();
appCheck.activate(
  '6LcmYU4tAAAAAOFwL2zGX9VDOLRSOd0bfdzGyGgI',
  true
);

const db = firebase.firestore();

// ============================================================
// ELEMENTOS
// ============================================================
const stepsDots = document.getElementById('stepsDots');
const dots = document.querySelectorAll('.dot');

const formTitle = document.getElementById('form-title');
const inputNome = document.getElementById('input-nome');
const inputSenha = document.getElementById('input-senha');
const submitBtn = document.getElementById('submit-btn');
const toggleModeBtn = document.getElementById('toggle-mode');

const userNomeSpan = document.getElementById('user-nome');
const userSaldoSpan = document.getElementById('user-saldo');
const userGixSpan = document.getElementById('user-gix');

const gixBtn = document.getElementById('gixBtn');
const logoutBtn = document.getElementById('logoutBtn');

const toGixInput = document.getElementById('toGix');
const findRecipientBtn = document.getElementById('findRecipientBtn');
const backToDashboardBtn = document.getElementById('backToDashboardBtn');

const amountInput = document.getElementById('amount');
const reviewBtn = document.getElementById('reviewBtn');
const backToRecipientBtn = document.getElementById('backToRecipientBtn');

const confirmBtn = document.getElementById('confirmBtn');
const backToAmountBtn = document.getElementById('backToAmountBtn');

const downloadImgBtn = document.getElementById('downloadImgBtn');
const downloadPdfBtn = document.getElementById('downloadPdfBtn');
const newTransferBtn = document.getElementById('newTransferBtn');

// ============================================================
// ESTADO
// ============================================================
let isLoginMode = true;
let unsubscribeSaldo = null;

let myDocId = '';
let myNome = '';
let myGixCode = '';
let myData = { saldo: 0 };

let recipientDocId = '';
let recipientNome = '';
let recipientGix = '';
let transferAmount = 0;

// ============================================================
// HELPERS
// ============================================================
function gerarGix() {
  return 'SUL' + Math.floor(100000 + Math.random() * 900000);
}

function formatarSaldo(valor) {
  const numero = Number(valor);
  if (isNaN(numero)) {
    console.warn('Saldo veio em formato inesperado do Firestore:', valor);
    return 0;
  }
  return numero;
}

function comPrimeiraLetraMaiuscula(nome) {
  if (!nome) return nome;
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

// ============================================================
// HASH DE SENHA — bcrypt (via bcryptjs), com migração automática
// ============================================================
// Reconhece 3 formatos possíveis salvos no banco:
//   1) texto puro          (contas bem antigas)
//   2) SHA-256              (migração anterior)
//   3) bcrypt ($2a$/$2b$/$2y$...) — formato final, com salt aleatório
//      de verdade e custo computacional de propósito.
// Sempre que uma conta loga com um formato mais fraco, migramos
// silenciosamente para bcrypt.

function ehHashBcrypt(valor) {
  return typeof valor === 'string' && /^\$2[aby]\$\d{2}\$/.test(valor);
}

function pareceHash(valor) {
  return typeof valor === 'string' && /^[a-f0-9]{64}$/i.test(valor);
}

async function gerarHashSenha(nome, senha) {
  // SHA-256 antigo — mantido só pra conseguir verificar contas
  // que já migraram pra esse formato antes do bcrypt existir.
  const textoComSal = nome.toLowerCase() + ':' + senha;
  const encoder = new TextEncoder();
  const dados = encoder.encode(textoComSal);
  const bufferHash = await crypto.subtle.digest('SHA-256', dados);
  return Array.from(new Uint8Array(bufferHash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function gerarHashBcrypt(senha) {
  return dcodeIO.bcrypt.hashSync(senha, 10); // 10 = custo (rounds)
}

function verificarBcrypt(senha, hashSalvo) {
  return dcodeIO.bcrypt.compareSync(senha, hashSalvo);
}

// Verifica a senha digitada contra o que está salvo, e migra
// automaticamente para bcrypt se ainda não estiver nesse formato.
// Retorna true/false.
async function verificarEMigrarSenha(nome, senhaDigitada, senhaSalva, docRef) {
  if (ehHashBcrypt(senhaSalva)) {
    return verificarBcrypt(senhaDigitada, senhaSalva);
  }

  if (pareceHash(senhaSalva)) {
    const hashCalc = await gerarHashSenha(nome, senhaDigitada);
    if (hashCalc !== senhaSalva) return false;
    const novoBcrypt = gerarHashBcrypt(senhaDigitada);
    docRef.update({ senha: novoBcrypt }).catch(err =>
      console.warn('Não foi possível migrar sha256 → bcrypt:', err)
    );
    return true;
  }

  // Texto puro
  if (senhaSalva !== senhaDigitada) return false;
  const novoBcrypt = gerarHashBcrypt(senhaDigitada);
  docRef.update({ senha: novoBcrypt }).catch(err =>
    console.warn('Não foi possível migrar texto puro → bcrypt:', err)
  );
  return true;
}

function showStep(id, dotIndex = null) {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');

  const transferSteps = ['step-recipient', 'step-amount', 'step-confirm', 'step-receipt'];
  if (transferSteps.includes(id)) {
    stepsDots.classList.add('visible');
    dots.forEach((d, i) => {
      d.classList.remove('active', 'done');
      if (dotIndex !== null) {
        if (i < dotIndex) d.classList.add('done');
        if (i === dotIndex) d.classList.add('active');
      }
    });
  } else {
    stepsDots.classList.remove('visible');
  }
}

function showError(id, msg) {
  const e = document.getElementById(id);
  e.textContent = msg;
  e.classList.add('show');
}
function hideError(id) {
  document.getElementById(id).classList.remove('show');
}

function resetLoginBtn() {
  submitBtn.disabled = false;
  submitBtn.textContent = isLoginMode ? "Acessar Conta" : "Finalizar Cadastro";
}

// ============================================================
// LOGIN / CADASTRO
// ============================================================
toggleModeBtn.addEventListener('click', () => {
  isLoginMode = !isLoginMode;
  hideError('loginError');
  if (isLoginMode) {
    formTitle.textContent = 'Entrar';
    submitBtn.textContent = 'Acessar Conta';
    toggleModeBtn.textContent = 'Ainda não tenho conta';
  } else {
    formTitle.textContent = 'Criar conta';
    submitBtn.textContent = 'Finalizar Cadastro';
    toggleModeBtn.textContent = 'Já sou cliente';
  }
  inputNome.value = '';
  inputSenha.value = '';
});

submitBtn.addEventListener('click', async () => {
  const nome = inputNome.value.trim();
  const senha = inputSenha.value.trim();
  hideError('loginError');

  if (!nome || !senha) {
    showError('loginError', 'Preencha os campos obrigatórios.');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Processando...";

  if (isLoginMode) {
    try {
      let nomeFinal = nome;
      let docRef = db.collection('Contas').doc(nomeFinal);
      let doc = await docRef.get();

      if (!doc.exists) {
        const nomeAlternativo = comPrimeiraLetraMaiuscula(nome);
        if (nomeAlternativo !== nome) {
          const docRefAlt = db.collection('Contas').doc(nomeAlternativo);
          const docAlt = await docRefAlt.get();
          if (docAlt.exists) {
            nomeFinal = nomeAlternativo;
            docRef = docRefAlt;
            doc = docAlt;
          }
        }
      }

      if (!doc.exists) {
        showError('loginError', 'Usuário não localizado. Verifique o nome digitado.');
        resetLoginBtn();
        return;
      }

      const data = doc.data();

      const senhaOk = await verificarEMigrarSenha(nomeFinal, senha, data.senha, docRef);
      if (!senhaOk) {
        showError('loginError', 'Credenciais incorretas.');
        resetLoginBtn();
        return;
      }

      entrarNaConta(nomeFinal, data);

    } catch (error) {
      console.error("Erro ao autenticar:", error);
      showError('loginError', 'Erro de conexão com o servidor.');
      resetLoginBtn();
    }
  } else {
    try {
      const docRef = db.collection('Contas').doc(nome);
      const doc = await docRef.get();

      if (doc.exists) {
        showError('loginError', 'Este nome já está em uso.');
        resetLoginBtn();
        return;
      }

      const gix = gerarGix();
      const hashSenha = gerarHashBcrypt(senha);
      const novaConta = { senha: hashSenha, saldo: 0, gix: gix };
      await docRef.set(novaConta);

      entrarNaConta(nome, novaConta);

    } catch (error) {
      console.error("Erro ao criar conta:", error);
      showError('loginError', 'Erro ao criar conta no servidor.');
      resetLoginBtn();
    }
  }
});

function entrarNaConta(nome, data) {
  myDocId = nome;
  myNome = nome;
  myGixCode = data.gix;
  myData.saldo = formatarSaldo(data.saldo);

  userNomeSpan.textContent = nome;
  userSaldoSpan.textContent = myData.saldo;
  userGixSpan.textContent = data.gix;

  escutarSaldoEmTempoReal(nome);
  showStep('step-dashboard');
}

function escutarSaldoEmTempoReal(nome) {
  if (unsubscribeSaldo) unsubscribeSaldo();

  unsubscribeSaldo = db.collection('Contas').doc(nome).onSnapshot((doc) => {
    if (!doc.exists) return;
    const data = doc.data();
    myData.saldo = formatarSaldo(data.saldo);
    userSaldoSpan.textContent = myData.saldo;
  }, (error) => {
    console.error('Erro ao escutar saldo em tempo real:', error);
  });
}

logoutBtn.addEventListener('click', () => {
  if (unsubscribeSaldo) unsubscribeSaldo();
  location.reload();
});

// ============================================================
// FLUXO DE TRANSFERÊNCIA (GIX)
// ============================================================
gixBtn.addEventListener('click', () => {
  toGixInput.value = '';
  hideError('recipientError');
  showStep('step-recipient', 0);
});

backToDashboardBtn.addEventListener('click', () => showStep('step-dashboard'));
backToRecipientBtn.addEventListener('click', () => showStep('step-recipient', 0));
backToAmountBtn.addEventListener('click', () => showStep('step-amount', 1));

findRecipientBtn.addEventListener('click', async () => {
  const gix = toGixInput.value.trim().toUpperCase();
  hideError('recipientError');

  if (!gix) {
    showError('recipientError', 'Informe o GIX do destinatário');
    return;
  }
  if (gix === myGixCode) {
    showError('recipientError', 'Você não pode transferir para si mesmo');
    return;
  }

  findRecipientBtn.disabled = true;
  findRecipientBtn.textContent = 'Buscando...';

  try {
    const snap = await db.collection('Contas').where('gix', '==', gix).limit(1).get();

    if (snap.empty) {
      showError('recipientError', 'Destinatário não encontrado');
      return;
    }

    const docSnap = snap.docs[0];
    recipientDocId = docSnap.id;
    recipientNome = docSnap.id;
    recipientGix = gix;

    document.getElementById('recipientName').textContent = recipientNome;
    document.getElementById('recipientGixDisplay').textContent = 'GIX: ' + gix;
    document.getElementById('recipientAvatar').textContent = recipientNome[0].toUpperCase();
    amountInput.value = '';
    hideError('amountError');

    showStep('step-amount', 1);
  } catch (error) {
    console.error(error);
    showError('recipientError', 'Erro na busca. Tente novamente.');
  } finally {
    findRecipientBtn.disabled = false;
    findRecipientBtn.textContent = 'Buscar conta →';
  }
});

reviewBtn.addEventListener('click', () => {
  const val = parseInt(amountInput.value);
  hideError('amountError');

  if (!val || val <= 0) {
    showError('amountError', 'Informe um valor válido');
    return;
  }
  if (val > myData.saldo) {
    showError('amountError', `Saldo insuficiente. Você tem ${myData.saldo} sulegais`);
    return;
  }

  transferAmount = val;
  document.getElementById('confirmTo').textContent = recipientNome;
  document.getElementById('confirmGix').textContent = recipientGix;
  document.getElementById('confirmAmount').textContent = val + ' sulegais';
  document.getElementById('confirmAfter').textContent = (myData.saldo - val) + ' sulegais';

  hideError('transferError');
  showStep('step-confirm', 2);
});

confirmBtn.addEventListener('click', async () => {
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Enviando...';
  hideError('transferError');

  try {
    const sRef = db.collection('Contas').doc(myDocId);
    const rRef = db.collection('Contas').doc(recipientDocId);

    await db.runTransaction(async (t) => {
      const sSnap = await t.get(sRef);
      const rSnap = await t.get(rRef);

      if (!sSnap.exists || !rSnap.exists) throw new Error('Conta não encontrada');

      const currentSaldo = formatarSaldo(sSnap.data().saldo);
      if (currentSaldo < transferAmount) throw new Error('Saldo insuficiente');

      const newS = currentSaldo - transferAmount;
      const newR = formatarSaldo(rSnap.data().saldo) + transferAmount;

      t.update(sRef, { saldo: newS });
      t.update(rRef, { saldo: newR });

      myData.saldo = newS;
    });

    montarComprovante();
    showStep('step-receipt', 3);

  } catch (error) {
    console.error(error);
    const msg = error.message === 'Saldo insuficiente'
      ? 'Saldo insuficiente para esta transação'
      : 'Falha na transação. Tente novamente.';
    showError('transferError', msg);
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = '✓ Confirmar e enviar';
  }
});

// ============================================================
// COMPROVANTE
// ============================================================
function montarComprovante() {
  const agora = new Date();
  const dataFormatada = agora.toLocaleDateString('pt-BR') + ' às ' +
    agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const transacaoId = 'TX' + agora.getTime().toString().slice(-9);

  document.getElementById('receiptDate').textContent = dataFormatada;
  document.getElementById('receiptFrom').textContent = myNome;
  document.getElementById('receiptTo').textContent = recipientNome;
  document.getElementById('receiptGix').textContent = recipientGix;
  document.getElementById('receiptAmount').textContent = transferAmount + ' sulegais';
  document.getElementById('receiptId').textContent = transacaoId;
}

newTransferBtn.addEventListener('click', () => {
  toGixInput.value = '';
  amountInput.value = '';
  showStep('step-dashboard');
});

downloadImgBtn.addEventListener('click', async () => {
  downloadImgBtn.disabled = true;
  downloadImgBtn.textContent = 'Gerando imagem...';
  try {
    const canvas = await html2canvas(document.getElementById('receiptCard'), {
      backgroundColor: '#0b0f1a',
      scale: 2
    });
    const link = document.createElement('a');
    link.download = `comprovante-${document.getElementById('receiptId').textContent}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (error) {
    console.error('Erro ao gerar imagem:', error);
  } finally {
    downloadImgBtn.disabled = false;
    downloadImgBtn.textContent = 'Baixar como Imagem';
  }
});

downloadPdfBtn.addEventListener('click', async () => {
  downloadPdfBtn.disabled = true;
  downloadPdfBtn.textContent = 'Gerando PDF...';
  try {
    const canvas = await html2canvas(document.getElementById('receiptCard'), {
      backgroundColor: '#0b0f1a',
      scale: 2
    });
    const imgData = canvas.toDataURL('image/png');

    const { jsPDF } = window.jspdf;
    const imgWidthMM = 100;
    const imgHeightMM = (canvas.height * imgWidthMM) / canvas.width;

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [imgWidthMM + 20, imgHeightMM + 20]
    });

    pdf.addImage(imgData, 'PNG', 10, 10, imgWidthMM, imgHeightMM);
    pdf.save(`comprovante-${document.getElementById('receiptId').textContent}.pdf`);
  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
  } finally {
    downloadPdfBtn.disabled = false;
    downloadPdfBtn.textContent = 'Baixar como PDF';
  }
});
