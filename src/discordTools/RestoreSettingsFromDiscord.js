/*
    RestoreSettingsFromDiscord.js

    При редеплое на Railway файл instances/*.json пропадает.
    Эта функция читает состояние кнопок и select-меню прямо из Discord-канала settings
    и восстанавливает generalSettings и notificationSettings в instance.

    Вызывается из SetupSettingsMenu перед тем как решить — пересоздавать канал или нет.
*/

const Discord = require('discord.js');
const DiscordTools = require('./discordTools.js');

const SUCCESS = Discord.ButtonStyle.Success;

module.exports = async (client, guild) => {
    const instance = client.getInstance(guild.id);
    const channel = DiscordTools.getTextChannelById(guild.id, instance.channelId.settings);
    if (!channel) return;

    let messages = [];
    try {
        const fetched = await channel.messages.fetch({ limit: 100 });
        messages = [...fetched.values()].reverse(); /* от старых к новым */
    }
    catch (e) {
        return;
    }

    if (messages.length === 0) return;

    const gs = instance.generalSettings;
    const ns = instance.notificationSettings;

    for (const message of messages) {
        /* --- Обрабатываем SELECT МЕНЮ --- */
        for (const row of message.components) {
            for (const component of row.components) {
                if (component.type === Discord.ComponentType.StringSelect) {
                    const selected = component.options.find(o => o.default);
                    if (!selected) continue;
                    const val = selected.value;

                    switch (component.customId) {
                        case 'language':
                            gs.language = val;
                            break;
                        case 'VoiceGender':
                            gs.voiceGender = val;
                            break;
                        case 'Prefix':
                            gs.prefix = val;
                            break;
                        case 'Trademark':
                            gs.trademark = val;
                            break;
                        case 'CommandDelay':
                            gs.commandDelay = Number(val);
                            break;
                    }
                }

                /* --- Обрабатываем КНОПКИ --- */
                if (component.type === Discord.ComponentType.Button) {
                    const isOn = component.style === SUCCESS;

                    switch (component.customId) {
                        case 'AllowInGameCommands':
                            gs.inGameCommandsEnabled = isOn;
                            break;
                        case 'BotMutedInGame':
                            /* SUCCESS = unmuted, DANGER = muted */
                            gs.muteInGameBotMessages = !isOn;
                            break;
                        case 'InGameTeammateConnection':
                            gs.connectionNotify = isOn;
                            break;
                        case 'InGameTeammateAfk':
                            gs.afkNotify = isOn;
                            break;
                        case 'InGameTeammateDeath':
                            gs.deathNotify = isOn;
                            break;
                        case 'FcmAlarmNotification':
                            gs.fcmAlarmNotificationEnabled = isOn;
                            break;
                        case 'FcmAlarmNotificationEveryone':
                            gs.fcmAlarmNotificationEveryone = isOn;
                            break;
                        case 'SmartAlarmNotifyInGame':
                            gs.smartAlarmNotifyInGame = isOn;
                            break;
                        case 'SmartSwitchNotifyInGameWhenChangedFromDiscord':
                            gs.smartSwitchNotifyInGameWhenChangedFromDiscord = isOn;
                            break;
                        case 'LeaderCommandEnabled':
                            gs.leaderCommandEnabled = isOn;
                            break;
                        case 'LeaderCommandOnlyForPaired':
                            gs.leaderCommandOnlyForPaired = isOn;
                            break;
                        case 'MapWipeNotifyEveryone':
                            gs.mapWipeNotifyEveryone = isOn;
                            break;
                        case 'ItemAvailableNotifyInGame':
                            gs.itemAvailableInVendingMachineNotifyInGame = isOn;
                            break;
                        case 'DisplayInformationBattlemetricsAllOnlinePlayers':
                            gs.displayInformationBattlemetricsAllOnlinePlayers = isOn;
                            break;
                        case 'BattlemetricsServerNameChanges':
                            gs.battlemetricsServerNameChanges = isOn;
                            break;
                        case 'BattlemetricsTrackerNameChanges':
                            gs.battlemetricsTrackerNameChanges = isOn;
                            break;
                        case 'BattlemetricsGlobalNameChanges':
                            gs.battlemetricsGlobalNameChanges = isOn;
                            break;
                        case 'BattlemetricsGlobalLogin':
                            gs.battlemetricsGlobalLogin = isOn;
                            break;
                        case 'BattlemetricsGlobalLogout':
                            gs.battlemetricsGlobalLogout = isOn;
                            break;
                    }

                    /* Notification кнопки: customId вида DiscordNotification{"setting":"..."} */
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
        `Settings restored from Discord channel for guild ${guild.id}`);
};
