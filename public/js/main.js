window.onload = async function() {
  const res = await fetch('/api/files');
  const files = await res.json();
  const list = document.getElementById('fileList');
  list.innerHTML = '';
  files.forEach(file => {
    list.innerHTML += `<li class="list-group-item d-flex justify-content-between align-items-center">
      ${file}
      <span>
        <a href="/download/${file}" class="btn btn-sm btn-primary">Scarica</a>
        <a href="/delete/${file}" class="btn btn-sm btn-danger">Elimina</a>
      </span>
    </li>`;
  });
};