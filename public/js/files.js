window.onload = function() {
  loadFiles('');
};

function loadFiles(folderPath) {
  fetch('/api/files?folder=' + encodeURIComponent(folderPath))
    .then(res => res.json())
    .then(files => {
      const list = document.getElementById('fileList');
      list.innerHTML = '';
      if (folderPath !== '') {
        const back = folderPath.split('/').slice(0, -1).join('/');
        const li = document.createElement('li');
        li.className = 'list-group-item';
        li.innerHTML = '<a href="#" onclick="loadFiles(\'' + back + '\')">🔙 Torna indietro</a>';
        list.appendChild(li);
      }
      files.forEach(file => {
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between align-items-center';
        li.innerHTML = (file.type === 'folder' ? '📁 ' : '📄 ') +
          '<a href="#" onclick="loadFiles(\'' + file.path + '\')">' + file.name + '</a>';
        const actions = document.createElement('span');
        if (file.type === 'file') {
          actions.innerHTML = '<a href="/download/' + file.path + '" class="btn btn-sm btn-primary">Scarica</a> ' +
                              '<a href="/delete/' + file.path + '" class="btn btn-sm btn-danger">Elimina</a>';
        } else {
          actions.innerHTML = '<a href="/delete/' + file.path + '" class="btn btn-sm btn-danger">Elimina cartella</a>';
        }
        li.appendChild(actions);
        list.appendChild(li);
      });
    });
}