let mediaRecorder;
let chunks = [];

async function refresh() {
    const container = document.getElementById('auth');
    const res = await fetch('/api/me');
    const data = await res.json();

    if (data.authenticated) {
        container.innerHTML = `
            <p>Conectado como <strong>${data.email}</strong></p>
            <button id="logout">Cerrar sesión</button>
            <hr>
            <button id="record">🎤 Grabar</button>
            <div id="result"></div>
        `;
        document.getElementById('logout').addEventListener('click', async () => {
            await fetch('/logout', { method: 'POST' });
            refresh();
        });
        document.getElementById('record').addEventListener('click', toggleRecording);
    } else {
        container.innerHTML = `<a href="/login"><button>Iniciar sesión con Google</button></a>`;
    }
}

async function toggleRecording() {
    const button = document.getElementById('record');
    const resultEl = document.getElementById('result');

    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        return;
    }

    let stream;
    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
        resultEl.textContent = 'No se pudo acceder al micrófono: ' + err.message;
        return;
    }

    chunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
    mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        button.textContent = '🎤 Grabar';
        button.disabled = true;
        resultEl.textContent = 'Transcribiendo...';

        const blob = new Blob(chunks, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('audio', blob, 'recording.webm');

        try {
            const res = await fetch('/api/notes', { method: 'POST', body: formData });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            resultEl.innerHTML = `
                <p>Guardado ✓: "${data.text}"</p>
                <a href="${data.spreadsheetUrl}" target="_blank">Ver en Sheets</a>
            `;
        } catch (err) {
            resultEl.textContent = 'Error al guardar: ' + err.message;
        } finally {
            button.disabled = false;
        }
    };

    mediaRecorder.start();
    button.textContent = '⏹ Detener';
}

refresh();
