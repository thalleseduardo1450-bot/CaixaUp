const topbar = document.querySelector("#topbar");
const menuToggle = document.querySelector(".menu-toggle");
const themeToggle = document.querySelector(".theme-toggle");
const checkoutStatus = document.querySelector("#checkout-status");

const savedTheme = localStorage.getItem("caixaup-site-theme");
if (savedTheme === "dark") document.body.classList.add("dark");

themeToggle?.addEventListener("click", () => {
  const dark = document.body.classList.toggle("dark");
  localStorage.setItem("caixaup-site-theme", dark ? "dark" : "light");
  themeToggle.setAttribute("aria-label", dark ? "Usar tema claro" : "Usar tema escuro");
});

menuToggle?.addEventListener("click", () => {
  const open = topbar.classList.toggle("menu-open");
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
});

window.addEventListener("scroll", () => topbar.classList.toggle("scrolled", window.scrollY > 8), { passive: true });
document.querySelectorAll("nav a").forEach((link) => link.addEventListener("click", () => {
  topbar.classList.remove("menu-open");
  menuToggle?.setAttribute("aria-expanded", "false");
  menuToggle?.setAttribute("aria-label", "Abrir menu");
}));

document.querySelector(".comparison-toggle")?.addEventListener("click", (event) => {
  const button = event.currentTarget;
  const body = document.querySelector(".comparison-body");
  const open = body.classList.toggle("open");
  button.setAttribute("aria-expanded", String(open));
  button.querySelector("span").textContent = open ? "−" : "＋";
});

const planNames = { gratis: "Grátis", pro: "Pro", premium: "Premium" };
document.querySelectorAll("[data-plan]").forEach((button) => {
  button.addEventListener("click", () => {
    const plan = planNames[button.dataset.plan] || button.dataset.plan;
    checkoutStatus.textContent = button.dataset.plan === "gratis"
      ? "O plano Grátis está pronto para começar. O acesso completo depende do cadastro da conta."
      : `O teste de 7 dias do plano ${plan} será ativado pelo checkout seguro quando a assinatura estiver publicada.`;
    checkoutStatus.scrollIntoView({ behavior: "smooth", block: "center" });
  });
});

document.querySelectorAll("[data-demo-action]").forEach((button) => {
  button.addEventListener("click", () => {
    const messages = {
      finalize: "Demonstração: o próximo passo é escolher e registrar a forma de pagamento.",
      open: "Demonstração: os detalhes da venda ficam disponíveis para consulta.",
      edit: "Demonstração: os produtos voltam para a tela de adicionar e finalizar.",
      resume: "Demonstração: a venda pendente foi preparada para continuar.",
    };
    const message = document.querySelector("#checkout-status");
    if (!message) return;
    message.textContent = messages[button.dataset.demoAction] || "Ação demonstrativa do CaixaUp.";
    message.scrollIntoView({ behavior: "smooth", block: "center" });
  });
});
