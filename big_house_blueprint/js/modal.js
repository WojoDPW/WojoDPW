const root = () => document.getElementById('modal-root');

export function openModal(innerHTML, { onClose } = {}) {
  const r = root();
  r.innerHTML = `
    <div class="modal-overlay" data-close>
      <div class="modal-card" role="dialog">
        <button class="modal-close" data-close aria-label="Close">×</button>
        ${innerHTML}
      </div>
    </div>`;
  r.classList.add('open');
  r.querySelectorAll('[data-close]').forEach((el) =>
    el.addEventListener('click', (e) => {
      if (e.target.hasAttribute('data-close')) closeModal(onClose);
    })
  );
  const escHandler = (e) => {
    if (e.key === 'Escape') closeModal(onClose);
  };
  document.addEventListener('keydown', escHandler, { once: true });
  return r.querySelector('.modal-card');
}

export function closeModal(onClose) {
  const r = root();
  r.innerHTML = '';
  r.classList.remove('open');
  if (onClose) onClose();
}
