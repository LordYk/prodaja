/*
    RestoreSettingsFromDiscord.js

    При редеплое на Railway файлы instance и credentials пропадают.
    Эта функция читает состояние из Discord-каналов и восстанавливает:
    - credentials (из footer сообщения "👤 Аккаунт" в #settings)
    - serverList + battlemetricsId (из footer сообщений в #servers)
    - generalSettings и notificationSettings (из кнопок/select в #settings)
*/

const Discord = require('discord.js');
const Fs = require('fs');
const Path = require('path');

const DiscordTools = require('./discordTools.js');

const SUCCESS = Discord.ButtonStyle.Success;

module.exports = async (client, guild) => {
    const instance = client.getInstance(guild.id);

    /* ── 1. Восстанавливаем credentials из сообщения "👤 Аккаунт" в #settings ── */
    const settingsChannel = DiscordTools.getTextChannelById(guild.id, instance.channelId.settings);
    if (settingsChannel) {
        let settingsMessages = [];
        try {
            const fetched = await settingsChannel.messages.fetch({ limit: 100 });
            settingsMessages = [...fetched.values()].reverse();
        } catch (e) { /* ignore */ }

        for (const msg of settingsMessages) {
            if (msg.author.id !== client.user.id) continue;
            if (msg.embeds.length === 0) continue;
            if (msg.embeds[0].title !== '👤 Аккаунт') continue;

            const footer = msg.embeds[0].footer?.text;
            if (!footer) continue;

            try {
                const decoded = Buffer.from(footer, 'base64').toString('utf8');
                const credentials = JSON.parse(decoded);

                const credPath = Path.join(__dirname, '..', '..', 'credentials', `${guild.id}.json`);
                Fs.mkdirSync(Path.dirname(credPath), { recursive: true });
                Fs.writeFileSync(credPath, JSON.stringify(credentials, null, 2));

                /* Это редеплой — каналы уже существуют, не нужно их пересоздавать */
                const inst = client.getInstance(guild.id);
                if (inst.firstTime) {
                    inst.firstTime = false;
                    client.setInstance(guild.id, inst);
                }

                client.log(client.intlGet(null, 'infoCap'),
                    `[RestoreSettings] Credentials restored from Discord for guild ${guild.id}`);
            } catch (e) {
                client.log(client.intlGet(null, 'errorCap'),
                    `[RestoreSettings] Failed to restore credentials: ${e.message}`, 'error');
            }
            break;
        }

        /* ── 2. Восстанавливаем настройки из кнопок/select в #settings ─────────── */
        const gs = instance.generalSettings;
        const ns = instance.notificationSettings;

        for (const message of settingsMessages) {
            for (const row of message.components) {
                for (const component of row.components) {
                    if (component.type === Discord.ComponentType.StringSelect) {
                        const selected = component.options.find(o => o.default);
                        if (!selected) continue;
                        const val = selected.value;

                        switch (component.customId) {
                            case 'language':       gs.language = val; break;
                            case 'VoiceGender':    gs.voiceGender = val; break;
                            case 'Prefix':         gs.prefix = val; break;
                            case 'Trademark':      gs.trademark = val; break;
                            case 'CommandDelay':   gs.commandDelay = Number(val); break;
                        }
                    }

                    if (component.type === Discord.ComponentType.Button) {
                        const isOn = component.style === SUCCESS;

                        switch (component.customId) {
                            case 'AllowInGameCommands':
                                gs.inGameCommandsEnabled = isOn; break;
                            case 'BotMutedInGame':
                                gs.muteInGameBotMessages = !isOn; break;
                            case 'InGameTeammateConnection':
                                gs.connectionNotify = isOn; break;
                            case 'InGameTeammateAfk':
                                gs.afkNotify = isOn; break;
                            case 'InGameTeammateDeath':
                                gs.deathNotify = isOn; break;
                            case 'FcmAlarmNotification':
                                gs.fcmAlarmNotificationEnabled = isOn; break;
                            case 'FcmAlarmNotificationEveryone':
                                gs.fcmAlarmNotificationEveryone = isOn; break;
                            case 'SmartAlarmNotifyInGame':
                                gs.smartAlarmNotifyInGame = isOn; break;
                            case 'SmartSwitchNotifyInGameWhenChangedFromDiscord':
                                gs.smartSwitchNotifyInGameWhenChangedFromDiscord = isOn; break;
                            case 'LeaderCommandEnabled':
                                gs.leaderCommandEnabled = isOn; break;
                            case 'LeaderCommandOnlyForPaired':
                                gs.leaderCommandOnlyForPaired = isOn; break;
                            case 'MapWipeNotifyEveryone':
                                gs.mapWipeNotifyEveryone = isOn; break;
                            case 'ItemAvailableNotifyInGame':
                                gs.itemAvailableInVendingMachineNotifyInGame = isOn; break;
                            case 'DisplayInformationBattlemetricsAllOnlinePlayers':
                                gs.displayInformationBattlemetricsAllOnlinePlayers = isOn; break;
                            case 'BattlemetricsServerNameChanges':
                                gs.battlemetricsServerNameChanges = isOn; break;
                            case 'BattlemetricsTrackerNameChanges':
                                gs.battlemetricsTrackerNameChanges = isOn; break;
                            case 'BattlemetricsGlobalNameChanges':
                                gs.battlemetricsGlobalNameChanges = isOn; break;
                            case 'BattlemetricsGlobalLogin':
                                gs.battlemetricsGlobalLogin = isOn; break;
                            case 'BattlemetricsGlobalLogout':
                                gs.battlemetricsGlobalLogout = isOn; break;
                        }

                        if (component.customId.startsWith('DiscordNotification')) {
                            try {
                                const json = component.customId.replace('DiscordNotification', '');
                                const { setting } = JSON.parse(json);
                                if (ns[setting]) ns[setting].discord = isOn;
                            } catch (e) { /* ignore */ }
                        }
                        if (component.customId.startsWith('InGameNotification')) {
                            try {
                                const json = component.customId.replace('InGameNotification', '');
                                const { setting } = JSON.parse(json);
                                if (ns[setting]) ns[setting].inGame = isOn;
                            } catch (e) { /* ignore */ }
                        }
                        if (component.customId.startsWith('VoiceNotification')) {
                            try {
                                const json = component.customId.replace('VoiceNotification', '');
                                const { setting } = JSON.parse(json);
                                if (ns[setting]) ns[setting].voice = isOn;
                            } catch (e) { /* ignore */ }
                        }
                    }
                }
            }
        }

        client.setInstance(guild.id, instance);
        client.log(client.intlGet(null, 'infoCap'),
            `[RestoreSettings] Settings restored from Discord channel for guild ${guild.id}`);
    }

    /* ── 3. Восстанавливаем serverList из footer сообщений в #servers ─────────── */
    const serversChannel = DiscordTools.getTextChannelById(guild.id, instance.channelId.servers);
    if (!serversChannel) return;

    let serverMessages = [];
    try {
        const fetched = await serversChannel.messages.fetch({ limit: 50 });
        serverMessages = [...fetched.values()].reverse();
    } catch (e) { return; }

    if (serverMessages.length === 0) return;

    const restoredInstance = client.getInstance(guild.id);
    let restored = 0;

    for (const msg of serverMessages) {
        if (msg.author.id !== client.user.id) continue;
        if (msg.embeds.length === 0) continue;

        const footer = msg.embeds[0].footer?.text;
        if (!footer) continue;

        /* Пробуем декодировать footer как JSON с данными сервера */
        let serverData = null;
        try {
            const decoded = Buffer.from(footer, 'base64').toString('utf8');
            serverData = JSON.parse(decoded);
        } catch (e) { continue; }

        /* Проверяем что это данные сервера (должны быть serverIp и appPort) */
        if (!serverData.serverIp || !serverData.appPort || !serverData.steamId) continue;

        const serverId = `${serverData.serverIp}-${serverData.appPort}`;

        /* Определяем был ли этот сервер активным (кнопка Disconnect = был подключён) */
        let wasActive = false;
        for (const row of msg.components) {
            for (const comp of row.components) {
                if (comp.customId && comp.customId.startsWith('ServerDisconnect')) {
                    wasActive = true;
                }
                if (comp.customId && comp.customId.startsWith('ServerReconnecting')) {
                    wasActive = true;
                }
            }
        }

        /* Восстанавливаем serverList только если там нет этого сервера */
        if (!restoredInstance.serverList.hasOwnProperty(serverId)) {
            restoredInstance.serverList[serverId] = {
                title: serverData.title || '',
                serverIp: serverData.serverIp,
                appPort: serverData.appPort,
                steamId: serverData.steamId,
                playerToken: serverData.playerToken || null,
                description: serverData.description || '',
                img: serverData.img || '',
                url: serverData.url || '',
                notes: {},
                switches: {},
                alarms: {},
                storageMonitors: {},
                markers: {},
                switchGroups: {},
                messageId: msg.id,
                battlemetricsId: serverData.battlemetricsId || null,
                connect: serverData.connect || null,
                cargoShipEgressTimeMs: serverData.cargoShipEgressTimeMs || null,
                oilRigLockedCrateUnlockTimeMs: serverData.oilRigLockedCrateUnlockTimeMs || null,
                timeTillDay: null,
                timeTillNight: null
            };
            if (wasActive) {
                restoredInstance.activeServer = serverId;
            }
            restored++;
            client.log(client.intlGet(null, 'infoCap'),
                `[RestoreSettings] Restored server ${serverId} (${serverData.title}) from Discord for guild ${guild.id}`);
        } else {
            /* Сервер уже есть — обновляем messageId и battlemetricsId если нужно */
            restoredInstance.serverList[serverId].messageId = msg.id;
            if (!restoredInstance.serverList[serverId].battlemetricsId && serverData.battlemetricsId) {
                restoredInstance.serverList[serverId].battlemetricsId = serverData.battlemetricsId;
            }
        }
    }

    if (restored > 0) {
        client.setInstance(guild.id, restoredInstance);
        client.log(client.intlGet(null, 'infoCap'),
            `[RestoreSettings] Restored ${restored} server(s) from Discord for guild ${guild.id}`);
    }
};
