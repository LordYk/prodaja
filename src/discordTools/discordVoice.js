/*
    Copyright (C) 2022 Alexander Emanuelsson (alexemanuelol)
    Copyright (C) 2023 FaiThiX

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
const { getVoiceConnection, createAudioPlayer, createAudioResource, StreamType } = require('@discordjs/voice');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const Client = require('../../index.ts');

/*
 * Microsoft Edge TTS — бесплатный, без ключей, без лимитов.
 * Использует те же голоса что в браузере Edge (Azure Neural voices).
 *
 * Таблица голосов: код языка → [male voice, female voice]
 */
const VOICE_MAP = {
    'cs': { male: 'cs-CZ-AntoninNeural',  female: 'cs-CZ-VlastaNeural'    },
    'de': { male: 'de-DE-ConradNeural',    female: 'de-DE-KatjaNeural'     },
    'en': { male: 'en-US-GuyNeural',       female: 'en-US-AriaNeural'      },
    'es': { male: 'es-ES-AlvaroNeural',    female: 'es-ES-ElviraNeural'    },
    'fr': { male: 'fr-FR-HenriNeural',     female: 'fr-FR-DeniseNeural'    },
    'it': { male: 'it-IT-DiegoNeural',     female: 'it-IT-ElsaNeural'      },
    'ko': { male: null,                    female: 'ko-KR-SunHiNeural'     },
    'pl': { male: 'pl-PL-MarekNeural',     female: 'pl-PL-ZofiaNeural'     },
    'ru': { male: 'ru-RU-DmitryNeural',    female: 'ru-RU-SvetlanaNeural'  },
    'sv': { male: null,                    female: 'sv-SE-SofieNeural'     },
    'tr': { male: 'tr-TR-AhmetNeural',     female: 'tr-TR-EmelNeural'      },
};

module.exports = {
    sendDiscordVoiceMessage: async function (guildId, text) {
        const connection = getVoiceConnection(guildId);
        if (!connection) return;

        const voiceName = await this.getVoice(guildId);
        if (!voiceName) return;

        try {
            const tts = new MsEdgeTTS();
            await tts.setMetadata(voiceName, OUTPUT_FORMAT.WEBM_24KHZ_16BIT_MONO_OPUS);

            const stream = tts.toStream(text);

            const resource = createAudioResource(stream, {
                inputType: StreamType.WebmOpus
            });

            const player = createAudioPlayer();
            connection.subscribe(player);
            player.play(resource);
        }
        catch (e) {
            Client.client.log(Client.client.intlGet(null, 'errorCap'),
                `[discordVoice] Failed to get TTS audio: ${e.message}`, 'error');
        }
    },

    getVoice: async function (guildId) {
        const instance = Client.client.getInstance(guildId);
        const language = instance.generalSettings.language || 'en';
        const gender = instance.generalSettings.voiceGender || 'male';

        const voices = VOICE_MAP[language] || VOICE_MAP['en'];

        if (voices[gender] !== null && voices[gender] !== undefined) {
            return voices[gender];
        }
        /* Если голоса нужного пола нет — берём другой */
        return voices[gender === 'male' ? 'female' : 'male'];
    },
};
