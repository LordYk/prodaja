/*
    Copyright (C) 2022 Alexander Emanuelsson (alexemanuelol)

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.

    https://github.com/alexemanuelol/rustplusplus

*/

const Fs = require('fs');
const Path = require('path');

const Client = require('../../index.ts');

/**
 * При Railway (и других платформах без persistent storage) файлы credentials
 * удаляются при редеплое. Чтобы сохранить credentials между редеплоями,
 * поддерживаем два механизма:
 *
 * 1. Env-переменная CREDENTIALS_<GUILD_ID> (формат: base64 JSON).
 *    При запуске, если файл отсутствует, он восстанавливается из env.
 *    При записи — если RAILWAY_ENVIRONMENT задан, также кладём данные
 *    обратно в process.env для логирования (Railway сам env не меняет,
 *    поэтому нужно задавать переменную вручную в Railway Dashboard один раз
 *    после первого /credentials add — инструкция в README).
 *
 * 2. Файловая система (стандартное поведение для self-hosted).
 */

function getCredentialsEnvKey(guildId) {
    return `CREDENTIALS_${guildId}`;
}

function tryRestoreCredentialsFromEnv(guildId, path) {
    const envKey = getCredentialsEnvKey(guildId);
    const envVal = process.env[envKey];
    if (!envVal) return false;

    try {
        const decoded = Buffer.from(envVal, 'base64').toString('utf8');
        const parsed = JSON.parse(decoded);
        // Убеждаемся что папка существует
        Fs.mkdirSync(Path.dirname(path), { recursive: true });
        Fs.writeFileSync(path, JSON.stringify(parsed, null, 2));
        return true;
    }
    catch (e) {
        console.error(`[instanceUtils] Failed to restore credentials from env ${envKey}:`, e.message);
        return false;
    }
}

function credentialsToEnvValue(credentials) {
    return Buffer.from(JSON.stringify(credentials)).toString('base64');
}

module.exports = {
    getSmartDevice: function (guildId, entityId) {
        /* Temporary function till discord modals gets more functional */
        const instance = Client.client.getInstance(guildId);

        for (const serverId in instance.serverList) {
            for (const switchId in instance.serverList[serverId].switches) {
                if (entityId === switchId) return { type: 'switch', serverId: serverId }
            }
            for (const alarmId in instance.serverList[serverId].alarms) {
                if (entityId === alarmId) return { type: 'alarm', serverId: serverId }
            }
            for (const storageMonitorId in instance.serverList[serverId].storageMonitors) {
                if (entityId === storageMonitorId) return { type: 'storageMonitor', serverId: serverId }
            }
        }
        return null;
    },

    readInstanceFile: function (guildId) {
        const path = Path.join(__dirname, '..', '..', 'instances', `${guildId}.json`);
        return JSON.parse(Fs.readFileSync(path, 'utf8'));
    },

    writeInstanceFile: function (guildId, instance) {
        const path = Path.join(__dirname, '..', '..', 'instances', `${guildId}.json`);
        Fs.writeFileSync(path, JSON.stringify(instance, null, 2));
    },

    readCredentialsFile: function (guildId) {
        const path = Path.join(__dirname, '..', '..', 'credentials', `${guildId}.json`);

        // Если файл не существует — пробуем восстановить из env (Railway redeploy)
        if (!Fs.existsSync(path)) {
            const restored = tryRestoreCredentialsFromEnv(guildId, path);
            if (!restored) {
                // Возвращаем пустые credentials если ничего нет
                return { hoster: null };
            }
        }

        return JSON.parse(Fs.readFileSync(path, 'utf8'));
    },

    writeCredentialsFile: function (guildId, credentials) {
        const path = Path.join(__dirname, '..', '..', 'credentials', `${guildId}.json`);
        Fs.mkdirSync(Path.dirname(path), { recursive: true });
        Fs.writeFileSync(path, JSON.stringify(credentials, null, 2));

        // Обновляем env-переменную в памяти процесса (актуально для текущей сессии).
        // Для Railway: после первого /credentials add скопируй значение из логов
        // и задай в Railway Dashboard: CREDENTIALS_<GUILD_ID> = <base64_value>
        const envKey = getCredentialsEnvKey(guildId);
        const b64 = credentialsToEnvValue(credentials);
        process.env[envKey] = b64;

        // Выводим подсказку для Railway при первом сохранении
        if (process.env.RAILWAY_ENVIRONMENT !== undefined) {
            console.log(`[Railway] Credentials updated. To persist across redeploys, set this env variable in Railway Dashboard:`);
            console.log(`  Key:   ${envKey}`);
            console.log(`  Value: ${b64}`);
        }
    },

    /**
     * Получить base64-строку credentials для ручного сохранения в Railway.
     * Используется в команде /credentials show.
     */
    getCredentialsEnvString: function (guildId) {
        const path = Path.join(__dirname, '..', '..', 'credentials', `${guildId}.json`);
        if (!Fs.existsSync(path)) return null;
        const credentials = JSON.parse(Fs.readFileSync(path, 'utf8'));
        return credentialsToEnvValue(credentials);
    },
}
