/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Helper pagination untuk query Supabase / PostgREST.
 *
 * Server Supabase membatasi maksimal 1000 baris per request (db max-rows).
 * Jika sebuah query meminta lebih dari itu, hasilnya dipotong diam-diam tanpa
 * error, sehingga data bisa hilang sebagian. Helper ini mengambil semua baris
 * per halaman sampai habis agar tidak ada data yang terpotong.
 */

export const PAGED_QUERY_PAGE_SIZE = 1000;

type PagedQuery = {
    range: (from: number, to: number) => PromiseLike<any>;
};

/**
 * Jalankan query secara berhalaman.
 * @param create factory yang selalu mengembalikan query builder baru
 *              (wajib sudah di-`order` dengan kolom yang unik agar pagination stabil)
 * @returns seluruh baris hasil query
 */
export async function fetchAllRows(create: () => PagedQuery): Promise<any[]> {
    const rows: any[] = [];
    let from = 0;

    for (;;) {
        const page = await create().range(from, from + PAGED_QUERY_PAGE_SIZE - 1);
        const message = String(page?.error?.message || '');

        if (page?.error) {
            // Rentang melewati jumlah data (mis. kelipatan 1000) -> dianggap selesai.
            if (message.toLowerCase().includes('range not satisfiable')) break;
            throw new Error(message || 'Gagal mengambil data');
        }

        const chunk: any[] = Array.isArray(page?.data) ? page.data : [];
        rows.push(...chunk);

        if (chunk.length < PAGED_QUERY_PAGE_SIZE) break;
        from += PAGED_QUERY_PAGE_SIZE;

        // Pengaman agar tidak loop tak terbatas.
        if (from > 100000) break;
    }

    return rows;
}
