import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";

export default {
    data: new SlashCommandBuilder()
        .setName("weather")
        .setDescription("Получить актуальную информацию о погоде в указанном месте")
        .addStringOption((option) =>
            option
                .setName("city")
                .setDescription("Название города, например: «Лондон» или «Токио»")
                .setRequired(true),
        ),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Не удалось отложить взаимодействие Weather`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'weather'
            });
            return;
        }

        const city = interaction.options.getString("city");

        const geoResponse = await fetch(
            `${GEOCODING_URL}?name=${encodeURIComponent(city)}`,
        );
        const geoData = await geoResponse.json();

        if (!geoData.results || geoData.results.length === 0) {
            logger.info(`Команда Weather — город не найден`, {
                userId: interaction.user.id,
                city: city,
                guildId: interaction.guildId
            });

            await replyUserError(interaction, {
                type: ErrorTypes.USER_INPUT,
                message: `Не удалось найти местоположение **${city}**. Проверьте правильность написания.`,
            });
            return;
        }

        const { latitude, longitude, name, country } = geoData.results[0];
        const cityDisplay = name;

        const weatherResponse = await fetch(
            `${WEATHER_URL}?latitude=${latitude}&longitude=${longitude}&current_weather=true`,
        );
        const weatherData = await weatherResponse.json();

        if (weatherData.error) {
            logger.error(`Ошибка Weather API`, {
                error: weatherData.reason,
                city: city,
                userId: interaction.user.id,
                guildId: interaction.guildId
            });

            await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: 'Произошла ошибка сервиса погоды.',
            });
            return;
        }

        const current = weatherData.current || weatherData.current_weather || {};

        const temperature =
            current.temperature != null
                ? Math.round(current.temperature)
                : "Н/Д";

        const humidity =
            current.relativehumidity ??
            current.relative_humidity_2m ??
            "Н/Д";

        const windSpeed =
            current.windspeed != null
                ? Math.round(current.windspeed)
                : "Н/Д";

        const weatherCode =
            current.weathercode ??
            current.weather_code ??
            null;

        const condition = getWeatherDescription(weatherCode);

        const embed = createEmbed({
            title: `Погода в ${cityDisplay}, ${country}`,
            description: condition.description
        })
            .addFields(
                {
                    name: "Температура",
                    value: `${temperature}°C`,
                    inline: true,
                },
                {
                    name: "Влажность",
                    value: `${humidity}%`,
                    inline: true,
                },
                {
                    name: "Скорость ветра",
                    value: `${windSpeed} км/ч`,
                    inline: true,
                },
            )
            .setFooter({
                text: `Широта: ${latitude.toFixed(2)} | Долгота: ${longitude.toFixed(2)}`,
            });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed]
        });

        logger.info(`Команда Weather выполнена`, {
            userId: interaction.user.id,
            city: cityDisplay,
            country: country,
            temperature: temperature,
            guildId: interaction.guildId
        });
    },
};

function getWeatherDescription(code) {
    if (code >= 0 && code <= 3) {
        return {
            description: "Ясное небо / Переменная облачность",
            emoji: ""
        };
    } else if (code >= 45 && code <= 48) {
        return {
            description: "Туман и изморозь",
            emoji: ""
        };
    } else if (code >= 51 && code <= 67) {
        return {
            description: "Морось или дождь",
            emoji: ""
        };
    } else if (code >= 71 && code <= 75) {
        return {
            description: "Снегопад",
            emoji: ""
        };
    } else if (code >= 80 && code <= 86) {
        return {
            description: "Ливни (дождь/снег)",
            emoji: ""
        };
    } else if (code >= 95 && code <= 99) {
        return {
            description: "Гроза",
            emoji: ""
        };
    }

    return {
        description: "Неизвестные погодные условия.",
        emoji: ""
    };
}
