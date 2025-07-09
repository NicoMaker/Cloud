window.onload = async function() {
  const res = await fetch('/api/files');
  const files = await res.json();
  const list = document.getElementById('fileList');
  list.innerHTML = '';
  files.forEach(file => {
    const li = document.createElement('li');
    li.className = 'list-group-item d-flex justify-content-between align-items-center';
    li.textContent = file.path;

    const actions = document.createElement('span');
    if (file.type === 'file') {
      actions.innerHTML = `
        <a href="/download/${file.path}" class="btn btn-sm btn-primary">Scarica</a>
        <a href="/delete/${file.path}" class="btn btn-sm btn-danger">Elimina</a>
      `;
    }
    li.appendChild(actions);
    list.appendChild(li);
  });
};