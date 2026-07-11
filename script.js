const firebaseConfig = {
  apiKey: "AIzaSyCXFhRZ_Byp40-sIxaNkyICoe066p6J04w",
  authDomain: "banco-sulegal-e93c5.firebaseapp.com",
  projectId: "banco-sulegal-e93c5",
  storageBucket: "banco-sulegal-e93c5.firebasestorage.app",
  messagingSenderId: "917084456664",
  appId: "1:917084456664:web:0fa0ecae429aded7cbb9ad",
  measurementId: "G-LTXPBFK5JV"
};

// Inicializa o Firebase
firebase.initializeApp(firebaseConfig);

// Ativa o App Check (reCAPTCHA v3)
const appCheck = firebase.appCheck();
appCheck.activate(
  '6LcmYU4tAAAAAOFwL2zGX9VDOLRSOd0bfdzGyGgI',
  true // isTokenAutoRefreshEnabled
);

const db = firebase.firestore();

// Elementos da Interface
const message = document.getElementById('message');
const userInfo = document.getElementById('user-info');
const userNomeSpan = document.getElementById('user-nome');
const userSaldoSpan = document.getElementById('user-saldo');
const userGixSpan = document.getElementById('user-gix');

const formTitle = document.getElementById('form-title');
const inputNome = document.getElementById('input-nome');
const inputSenha = document.getElementById('input-senha');
const submitBtn = document.getElementById('submit-btn');
const toggleModeBtn = document.getElementById('toggle-mode');
const formBox = document.getElementById('form-box');

let isLoginMode = true;

// Função para gerar o código GIX único
function gerarGix() {
  return 'SUL' + Math.floor(100000 + Math.random() * 900000);
}

// Alterna entre os modos de Entrar e Criar Conta
toggleModeBtn.addEventListener('click', () => {
  isLoginMode = !isLoginMode;
  if (isLoginMode) {
    formTitle.textContent = 'Entrar';
    submitBtn.textContent = 'Acessar Conta';
    toggleModeBtn.textContent = 'Ainda não tenho conta';
    mostrarMensagem('', '');
  } else {
    formTitle.textContent = 'Criar conta';
    submitBtn.textContent = 'Finalizar Cadastro';
    toggleModeBtn.textContent = 'Já sou cliente';
    mostrarMensagem('', '');
  }
  inputNome.value = '';
  inputSenha.value = '';
});

// Evento do botão de envio (Acessar / Cadastrar)
submitBtn.addEventListener('click', async () => {
  const nome = inputNome.value.trim();
  const senha = inputSenha.value.trim();

  if (!nome || !senha) {
    mostrarMensagem('Preencha os campos obrigatórios.', 'var(--red)');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Processando...";

  if (isLoginMode) {
    // --- MODO DE LOGIN ---
    try {
      const docRef = db.collection('Contas').doc(nome);
      const doc = await docRef.get();

      if (!doc.exists) {
        mostrarMensagem('Usuário não localizado. Verifique o nome digitado.', 'var(--red)');
        resetBtn();
        return;
      }

      const data = doc.data();

      if (data.senha !== senha) {
        mostrarMensagem('Credenciais incorretas.', 'var(--red)');
        resetBtn();
        return;
      }

      mostrarMensagem('');
      mostrarUserInfo(nome, data.saldo, data.gix);
      formBox.style.display = 'none';

    } catch (error) {
      console.error("Erro ao autenticar:", error);
      mostrarMensagem('Erro de conexão com o servidor.', 'var(--red)');
      resetBtn();
    }
  } else {
    // --- MODO DE CADASTRO ---
    try {
      const docRef = db.collection('Contas').doc(nome);
      const doc = await docRef.get();

      if (doc.exists) {
        mostrarMensagem('Este nome já está em uso.', 'var(--red)');
        resetBtn();
        return;
      }

      const gix = gerarGix();
      await docRef.set({
        senha: senha,
        saldo: 0,
        gix: gix
      });

      mostrarMensagem('');
      mostrarUserInfo(nome, 0, gix);
      formBox.style.display = 'none';

    } catch (error) {
      console.error("Erro ao criar conta:", error);
      mostrarMensagem('Erro ao criar conta no servidor.', 'var(--red)');
      resetBtn();
    }
  }
});

// Reseta o estado do botão principal
function resetBtn() {
  submitBtn.disabled = false;
  submitBtn.textContent = isLoginMode ? "Acessar Conta" : "Finalizar Cadastro";
}

// Exibe mensagens de feedback na tela
function mostrarMensagem(texto, cor) {
  message.textContent = texto;
  message.style.color = cor;
}

// Altera a tela para exibir as informações do usuário logado
function mostrarUserInfo(nome, saldo, gix) {
  userNomeSpan.textContent = nome;
  userSaldoSpan.textContent = saldo;
  userGixSpan.textContent = gix;
  userInfo.style.display = 'block';
}
