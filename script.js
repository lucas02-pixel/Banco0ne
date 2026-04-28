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
const db = firebase.firestore();

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

function gerarGix() {
  return 'SUL' + Math.floor(100000 + Math.random() * 900000);
}

toggleModeBtn.addEventListener('click', () => {
  isLoginMode = !isLoginMode;
  if (isLoginMode) {
    formTitle.textContent = 'Entrar';
    submitBtn.textContent = 'Acessar Conta';
    toggleModeBtn.textContent = 'Ainda não tenho conta';
    message.textContent = '';
  } else {
    formTitle.textContent = 'Criar conta';
    submitBtn.textContent = 'Finalizar Cadastro';
    toggleModeBtn.textContent = 'Já sou cliente';
    message.textContent = '';
  }
  inputNome.value = '';
  inputSenha.value = '';
});

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
    try {
      const docRef = db.collection('Contas').doc(nome);
      const doc = await docRef.get();

      if (!doc.exists) {
        mostrarMensagem('Usuário não localizado.', 'var(--red)');
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
      mostrarMensagem('Erro de conexão.', 'var(--red)');
      resetBtn();
    }
  } else {
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
      mostrarMensagem('Erro ao criar conta.', 'var(--red)');
      resetBtn();
    }
  }
});

function resetBtn() {
  submitBtn.disabled = false;
  submitBtn.textContent = isLoginMode ? "Acessar Conta" : "Finalizar Cadastro";
}

function mostrarMensagem(texto, cor) {
  message.textContent = texto;
  message.style.color = cor;
}

function mostrarUserInfo(nome, saldo, gix) {
  userNomeSpan.textContent = nome;
  userSaldoSpan.textContent = saldo;
  userGixSpan.textContent = gix;
  userInfo.style.display = 'block';
}