async function refresh() {
    const container = document.getElementById('auth');
    const res = await fetch('/api/me');
    const data = await res.json();

    if (data.authenticated) {
        container.innerHTML = `
            <p>Conectado como <strong>${data.email}</strong></p>
            <button id="logout">Cerrar sesión</button>
        `;
        document.getElementById('logout').addEventListener('click', async () => {
            await fetch('/logout', { method: 'POST' });
            refresh();
        });
    } else {
        container.innerHTML = `<a href="/login"><button>Iniciar sesión con Google</button></a>`;
    }
}

refresh();
