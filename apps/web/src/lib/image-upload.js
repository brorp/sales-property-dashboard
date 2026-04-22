'use client';

import { apiRequest } from './api';

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === 'string' && reader.result.trim()) {
                resolve(reader.result);
                return;
            }
            reject(new Error('Gagal membaca file gambar'));
        };
        reader.onerror = () => reject(new Error('Gagal membaca file gambar'));
        reader.readAsDataURL(file);
    });
}

export async function uploadTaskProofImage(file, user) {
    if (!file) {
        throw new Error('Pilih file gambar terlebih dahulu.');
    }

    const dataUrl = await readFileAsDataUrl(file);
    const response = await apiRequest('/api/uploads/imagekit', {
        method: 'POST',
        user,
        body: {
            dataUrl,
            fileName: file.name || 'proof.png',
        },
    });

    return {
        dataUrl,
        url: response?.url || '',
    };
}
