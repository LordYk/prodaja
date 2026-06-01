/*
Copyright (C) 2022 Alexander Emanuelsson (alexemanuelol)

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

https://github.com/alexemanuelol/rustplusplus

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
        if (png) {
            return png[1];
        }
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
        if (data) {
            return Utils.decodeHtml(data[1]);
        }
        return null;
    },

    /**
     * Автоматически ищет battlemetricsId для Rust сервера.
     * Стратегия:
     *   1) Поиск по IP + game port
     *   2) Поиск по IP + query port (game port + 5)
     *   3) Поиск по названию сервера (если передан serverName)
     * Возвращает строку с ID или null если не нашёл.
     */
    getBattlemetricsServerId: async function (client, ip, port, serverName = null) {
        const baseUrl = 'https://api.battlemetrics.com/servers';
        const game = 'rust';

        /* 1. Поиск по IP + game port */
        try {
            const url1 = `${baseUrl}?filter[game]=${game}&filter[ids][IP]=${ip}:${port}&fields[server]=id,name,ip,port`;
            const res1 = await Axios.get(url1);
            if (res1.status === 200 && res1.data.data && res1.data.data.length > 0) {
                const id = res1.data.data[0].id;
                client.log(client.intlGet(null, 'infoCap'),
                    `BattleMetrics: найден сервер по IP+gameport: ${id}`, 'info');
                return id;
            }
        }
        catch (e) { /* продолжаем */ }

        /* 2. Поиск по IP + query port (обычно game port + 5) */
        const queryPort = port + 5;
        try {
            const url2 = `${baseUrl}?filter[game]=${game}&filter[ids][IP]=${ip}:${queryPort}&fields[server]=id,name,ip,port`;
            const res2 = await Axios.get(url2);
            if (res2.status === 200 && res2.data.data && res2.data.data.length > 0) {
                const id = res2.data.data[0].id;
                client.log(client.intlGet(null, 'infoCap'),
                    `BattleMetrics: найден сервер по IP+queryport: ${id}`, 'info');
                return id;
            }
        }
        catch (e) { /* продолжаем */ }

        /* 3. Поиск по названию сервера как последний вариант */
        if (serverName) {
            try {
                const encodedName = encodeURIComponent(serverName);
                const url3 = `${baseUrl}?filter[game]=${game}&filter[search]=${encodedName}&fields[server]=id,name,ip,port&page[size]=5`;
                const res3 = await Axios.get(url3);
                if (res3.status === 200 && res3.data.data && res3.data.data.length > 0) {
                    /* Ищем точное совпадение по IP среди результатов */
                    const exactMatch = res3.data.data.find(s => s.attributes.ip === ip);
                    if (exactMatch) {
                        client.log(client.intlGet(null, 'infoCap'),
                            `BattleMetrics: найден сервер по имени+IP: ${exactMatch.id}`, 'info');
                        return exactMatch.id;
                    }
                    /* Если точного нет — берём первый результат */
                    const id = res3.data.data[0].id;
                    client.log(client.intlGet(null, 'infoCap'),
                        `BattleMetrics: найден сервер по имени (первый результат): ${id}`, 'info');
                    return id;
                }
            }
            catch (e) { /* не нашли */ }
        }

        client.log(client.intlGet(null, 'infoCap'),
            `BattleMetrics: не удалось найти сервер ${ip}:${port}`, 'info');
        return null;
    },
};
