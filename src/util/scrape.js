/*
Copyright (C) 2022 Alexander Emanuelsson (alexemanuelol)
...
*/

const Axios = require('axios');
const Constants = require('../util/constants.js');
const Utils = require('../util/utils.js');

module.exports = {

    scrape: async function (url) {
        try {
            return await Axios.get(url);
        }
        catch (e) {
            return {};
        }
    },

    scrapeSteamProfilePicture: async function (client, steamId) {
        const response = await module.exports.scrape(`${Constants.STEAM_PROFILES_URL}${steamId}`);
        if (response.status !== 200) {
            client.log(client.intlGet(null, 'errorCap'), client.intlGet(null, 'failedToScrapeProfilePicture', {
                link: `${Constants.STEAM_PROFILES_URL}${steamId}`
            }), 'error');
            return null;
        }
        let png = response.data.match(/<img src="(.*_full.jpg)(.*?(?="))/);
        if (png) return png[1];
        return null;
    },

    scrapeSteamProfileName: async function (client, steamId) {
        const response = await module.exports.scrape(`${Constants.STEAM_PROFILES_URL}${steamId}`);
        if (response.status !== 200) {
            client.log(client.intlGet(null, 'errorCap'), client.intlGet(null, 'failedToScrapeProfileName', {
                link: `${Constants.STEAM_PROFILES_URL}${steamId}`
            }), 'error');
            return null;
        }
        let regex = new RegExp(`class="actual_persona_name">(.+?)</span>`, 'gm');
        let data = regex.exec(response.data);
        if (data) return Utils.decodeHtml(data[1]);
        return null;
    },

    /* Автоматически ищет BattleMetrics ID для Rust сервера.
       Пробует несколько способов:
       1) IP + разные порты (game, +1, +5, 28017, 28015)
       2) По полному названию сервера с проверкой IP
       3) По сокращённому названию (первые 2-3 слова) с проверкой IP
       4) Только по IP (без порта)
    */
    /* Ищет BattleMetrics ID для Rust сервера.
       ВАЖНО: некоторые серверы (Rusty Moose и др.) используют прокси/CDN —
       Rust+ видит один IP, BM хранит другой. Поэтому IP-проверка НЕ является
       обязательным условием — используем её только как предпочтение.
    */
    getBattlemetricsServerId: async function (client, ip, port, serverName = null) {
        const base = 'https://api.battlemetrics.com/servers';
        const log = (msg) => { if (client?.log) client.log('INFO', `[BM] ${msg}`); };

        /* Шаг 1: поиск по имени (основной — надёжнее чем IP для серверов с прокси) */
        if (serverName) {
            const clean = serverName.replace(/[|#\[\](){}]/g, ' ').replace(/\s+/g, ' ').trim();
            const words = clean.split(' ').filter(w => w.length > 0);
            const queries = [...new Set([
                clean,
                words.slice(0, 3).join(' '),
                words.slice(0, 2).join(' '),
            ])].filter(q => q.length >= 2);

            for (const q of queries) {
                try {
                    const res = await Axios.get(
                        `${base}?filter[game]=rust&filter[search]=${encodeURIComponent(q)}` +
                        `&fields[server]=id,name,ip,port&page[size]=100`,
                        { timeout: 8000 });
                    if (!res.data?.data?.length) continue;
                    const servers = res.data.data;

                    /* Предпочитаем IP-совпадение если есть */
                    const byIp = servers.find(s => s.attributes.ip === ip);
                    if (byIp) { log(`Found by IP match in name search: ${byIp.id}`); return byIp.id; }

                    /* Точное совпадение имени (сервер с прокси) */
                    const exact = servers.find(s => s.attributes.name === serverName);
                    if (exact) { log(`Found by exact name: ${exact.id}`); return exact.id; }

                    /* Частичное совпадение */
                    const partial = servers.find(s =>
                        s.attributes.name?.toLowerCase().includes(clean.toLowerCase()));
                    if (partial) { log(`Found by partial name: ${partial.id}`); return partial.id; }
                }
                catch (e) { /* продолжаем */ }
            }
        }

        /* Шаг 2: перебор портов по IP (для серверов без прокси) */
        const ports = [...new Set([
            port, port - 1, port - 2, port + 1, port + 2, port + 5,
            port - 67, port - 68,
            28015, 28016, 28017,
        ])].filter(p => p > 0 && p < 65536);

        for (const p of ports) {
            try {
                const res = await Axios.get(
                    `${base}?filter[game]=rust&filter[ids][IP]=${ip}:${p}&fields[server]=id,name,ip,port`,
                    { timeout: 6000 });
                if (res.data?.data?.length > 0) {
                    log(`Found by IP:port ${ip}:${p}: ${res.data.data[0].id}`);
                    return res.data.data[0].id;
                }
            }
            catch (e) { /* продолжаем */ }
        }

        log(`Not found: ip=${ip} port=${port} name="${serverName}"`);
        return null;
    },
};
