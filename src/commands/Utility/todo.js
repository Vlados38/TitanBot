import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getFromDb, setInDb } from '../../utils/database.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import crypto from 'crypto';

function generateShareId() {
    return crypto.randomBytes(16).toString('hex');
}

export default {
    data: new SlashCommandBuilder()
        .setName("todo")
        .setDescription("Управление вашим личным списком дел")
        .addSubcommand(subcommand =>
            subcommand
                .setName("add")
                .setDescription("Добавить задачу в список дел")
                .addStringOption(option =>
                    option
                        .setName("task")
                        .setDescription("Задача для добавления")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("list")
                .setDescription("Просмотреть ваш список дел")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("complete")
                .setDescription("Отметить задачу как выполненную")
                .addIntegerOption(option =>
                    option
                        .setName("number")
                        .setDescription("Номер задачи, которую нужно выполнить")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("Удалить задачу из вашего списка дел")
                .addIntegerOption(option =>
                    option
                        .setName("number")
                        .setDescription("Номер задачи, которую нужно удалить")
                        .setRequired(true)
                )
        )
        .addSubcommandGroup(group => 
            group
                .setName("share")
                .setDescription("Управление общими списками дел")
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("create")
                        .setDescription("Создать новый общий список дел")
                        .addStringOption(option =>
                            option
                                .setName("name")
                                .setDescription("Название общего списка")
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("add")
                        .setDescription("Добавить участника в общий список")
                        .addStringOption(option =>
                            option
                                .setName("list_id")
                                .setDescription("ID общего списка")
                                .setRequired(true)
                        )
                        .addUserOption(option =>
                            option
                                .setName("user")
                                .setDescription("Пользователь для добавления в список")
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("view")
                        .setDescription("Просмотреть общий список дел")
                        .addStringOption(option =>
                            option
                                .setName("list_id")
                                .setDescription("ID общего списка")
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("addtask")
                        .setDescription("Добавить задачу в общий список дел")
                        .addStringOption(option =>
                            option
                                .setName("list_id")
                                .setDescription("ID общего списка")
                                .setRequired(true)
                        )
                        .addStringOption(option =>
                            option
                                .setName("task")
                                .setDescription("Задача для добавления")
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("remove")
                        .setDescription("Удалить задачу из общего списка дел")
                        .addStringOption(option =>
                            option
                                .setName("list_id")
                                .setDescription("ID общего списка")
                                .setRequired(true)
                        )
                        .addIntegerOption(option =>
                            option
                                .setName("number")
                                .setDescription("Номер задачи, которую нужно удалить")
                                .setRequired(true)
                        )
                )
        )
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),
    category: "Utility",

    async execute(interaction, config, client) {
        const userId = interaction.user.id;
        const subcommand = interaction.options.getSubcommand();
        const shareSubcommand = interaction.options.getSubcommandGroup() === 'share'
            ? interaction.options.getSubcommand()
            : null;

        async function getOrCreateSharedList(listId, creatorId = null, listName = null) {
            const listKey = `shared_todo_${listId}`;
            let listData = await getFromDb(listKey, null);
            
            if (!listData || (listData.ok === false && listData.error)) {
                if (creatorId) {
                    listData = {
                        id: listId,
                        name: listName,
                        creatorId,
                        members: [creatorId],
                        tasks: [],
                        nextId: 1,
                        createdAt: new Date().toISOString()
                    };
                    await setInDb(listKey, listData);
                } else {
                    return null;
                }
            }
            
            if (listData) {
                if (!Array.isArray(listData.tasks)) listData.tasks = [];
                if (!listData.nextId) listData.nextId = 1;
                if (!Array.isArray(listData.members)) listData.members = [];
            }
            
            return listData;
        }

        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Ошибка отложенного ответа взаимодействия Todo`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'todo'
            });
            return;
        }

        if (shareSubcommand) {
            switch (shareSubcommand) {
                case 'create': {
                    const listName = interaction.options.getString('name');
                    const listId = generateShareId();

                    await getOrCreateSharedList(listId, userId, listName);

                    const userSharedLists = await getFromDb(`user_shared_lists_${userId}`, []);
                    const sharedListsArray = Array.isArray(userSharedLists) ? userSharedLists : [];

                    if (!sharedListsArray.includes(listId)) {
                        sharedListsArray.push(listId);
                        await setInDb(`user_shared_lists_${userId}`, sharedListsArray);
                    }

                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            successEmbed(
                                "Общий список создан",
                                `Создан общий список "${listName}" с ID: \`${listId}\`\n` +
                                `Используйте \`/todo share add list_id:${listId} user:@username\`, чтобы добавить участников.`
                            )
                        ]
                    });
                }

                case 'add': {
                    const listId = interaction.options.getString('list_id');
                    const memberToAdd = interaction.options.getUser('user');

                    const listData = await getOrCreateSharedList(listId);

                    if (!listData) {
                        return await replyUserError(interaction, {
                            type: ErrorTypes.UNKNOWN,
                            message: 'Общий список не найден.'
                        });
                    }

                    if (listData.creatorId !== userId) {
                        return await replyUserError(interaction, {
                            type: ErrorTypes.UNKNOWN,
                            message: 'Только создатель списка может добавлять участников.'
                        });
                    }

                    if (!listData.members.includes(memberToAdd.id)) {
                        listData.members.push(memberToAdd.id);
                        await setInDb(`shared_todo_${listId}`, listData);

                        const memberLists = await getFromDb(`user_shared_lists_${memberToAdd.id}`, []);
                        const memberListsArray = Array.isArray(memberLists) ? memberLists : [];

                        if (!memberListsArray.includes(listId)) {
                            memberListsArray.push(listId);
                            await setInDb(`user_shared_lists_${memberToAdd.id}`, memberListsArray);
                        }

                        return await InteractionHelper.safeEditReply(interaction, {
                            embeds: [
                                successEmbed(
                                    'Участник добавлен',
                                    `Пользователь ${memberToAdd.username} добавлен в общий список "${listData.name}"`
                                )
                            ]
                        });
                    } else {
                        return await replyUserError(interaction, {
                            type: ErrorTypes.UNKNOWN,
                            message: 'Пользователь уже является участником этого списка.'
                        });
                    }
                }

                case 'view': {
                    const listId = interaction.options.getString('list_id');
                    const listData = await getOrCreateSharedList(listId);

                    if (!listData) {
                        return await replyUserError(interaction, {
                            type: ErrorTypes.UNKNOWN,
                            message: 'Общий список не найден.'
                        });
                    }

                    if (!listData.members.includes(userId)) {
                        return await replyUserError(interaction, {
                            type: ErrorTypes.UNKNOWN,
                            message: 'У вас нет доступа к этому списку.'
                        });
                    }

                    if (listData.tasks.length === 0) {
                        const memberList = listData.members.map(memberId => {
                            const member = interaction.guild.members.cache.get(memberId);
                            return member ? member.user.username : `<@${memberId}>`;
                        }).join(',');

                        const owner = interaction.guild.members.cache.get(listData.creatorId);
                        const ownerName = owner
                            ? owner.user.username
                            : `<@${listData.creatorId}>`;

                        return await InteractionHelper.safeEditReply(interaction, {
                            embeds: [
                                successEmbed(
                                    `📋 **${listData.name}**\n\n` +
                                    `👑 **Владелец:** ${ownerName}\n` +
                                    `👥 **Участники:** ${memberList}\n\n` +
                                    `*Этот список пока пуст. Используйте кнопку «Добавить задачу», чтобы добавить задачи!*`,
                                    `Общий список (ID: \`${listId}\`)`
                                )
                            ],
                            components: [
                                new ActionRowBuilder().addComponents(
                                    new ButtonBuilder()
                                        .setCustomId(`shared_todo_add_${listId}`)
                                        .setLabel('Добавить задачу')
                                        .setStyle(ButtonStyle.Primary),

                                    new ButtonBuilder()
                                        .setCustomId(`shared_todo_complete_${listId}`)
                                        .setLabel('Выполнить задачу')
                                        .setStyle(ButtonStyle.Success),

                                    new ButtonBuilder()
                                        .setCustomId(`shared_todo_remove_${listId}`)
                                        .setLabel('Удалить задачу')
                                        .setStyle(ButtonStyle.Danger)
                                )
                            ]
                        });
                    }

                    const taskList = listData.tasks
                        .map(task =>
                            `${task.completed ? '✅' : '📝'} #${task.id} ${task.text}` +
                            `\`[${new Date(task.createdAt).toLocaleDateString()}]` +
                            (task.completed
                                ? `• Выполнено: ${task.completedBy}`
                                : '') + '`'
                        )
                        .join('\n');

                    const memberList = listData.members.map(memberId => {
                        const member = interaction.guild.members.cache.get(memberId);
                        return member ? member.user.username : `<@${memberId}>`;
                    }).join(',');

                    const owner = interaction.guild.members.cache.get(listData.creatorId);
                    const ownerName = owner
                        ? owner.user.username
                        : `<@${listData.creatorId}>`;

                    const fullListDisplay =
                        `📋 **${listData.name}**\n\n` +
                        `👑 **Владелец:** ${ownerName}\n` +
                        `👥 **Участники:** ${memberList}\n\n` +
                        `**Задачи:**\n${taskList}`;

                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            successEmbed(
                                `Общий список (ID: \`${listId}\`)`,
                                fullListDisplay
                            )
                        ],
                        components: [
                            new ActionRowBuilder().addComponents(
                                new ButtonBuilder()
                                    .setCustomId(`shared_todo_add_${listId}`)
                                    .setLabel('Добавить задачу')
                                    .setStyle(ButtonStyle.Primary),

                                new ButtonBuilder()
                                    .setCustomId(`shared_todo_complete_${listId}`)
                                    .setLabel('Выполнить задачу')
                                    .setStyle(ButtonStyle.Success),

                                new ButtonBuilder()
                                    .setCustomId(`shared_todo_remove_${listId}`)
                                    .setLabel('Удалить задачу')
                                    .setStyle(ButtonStyle.Danger)
                            )
                        ]
                    });
                }

                case 'addtask': {
                    const listId = interaction.options.getString('list_id');
                    const taskText = interaction.options.getString('task');

                    const listData = await getOrCreateSharedList(listId);

                    if (!listData) {
                        return await replyUserError(interaction, {
                            type: ErrorTypes.UNKNOWN,
                            message: 'Общий список не найден.'
                        });
                    }

                    if (!listData.members.includes(userId)) {
                        return await replyUserError(interaction, {
                            type: ErrorTypes.UNKNOWN,
                            message: 'У вас нет доступа к этому списку.'
                        });
                    }

                    const newTask = {
                        id: listData.nextId++,
                        text: taskText,
                        completed: false,
                        createdAt: new Date().toISOString(),
                        createdBy: userId
                    };

                    listData.tasks.push(newTask);
                    await setInDb(`shared_todo_${listId}`, listData);

                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            successEmbed(
                                'Задача добавлена',
                                `Задача "${taskText}" добавлена в общий список "${listData.name}"`
                            )
                        ]
                    });
                }

                case 'remove': {
                    const listId = interaction.options.getString('list_id');
                    const taskNumber = interaction.options.getInteger('number');

                    const listData = await getOrCreateSharedList(listId);

                    if (!listData) {
                        return await replyUserError(interaction, {
                            type: ErrorTypes.UNKNOWN,
                            message: 'Общий список не найден.'
                        });
                    }

                    if (!listData.members.includes(userId)) {
                        return await replyUserError(interaction, {
                            type: ErrorTypes.UNKNOWN,
                            message: 'У вас нет доступа к этому списку.'
                        });
                    }

                    const taskIndex = listData.tasks.findIndex(
                        task => task.id === taskNumber
                    );

                    if (taskIndex === -1) {
                        return await replyUserError(interaction, {
                            type: ErrorTypes.UNKNOWN,
                            message: 'Задача не найдена.'
                        });
                    }

                    const [removedTask] = listData.tasks.splice(taskIndex, 1);
                    await setInDb(`shared_todo_${listId}`, listData);

                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            successEmbed(
                                'Задача удалена',
                                `Задача "${removedTask.text}" удалена из общего списка "${listData.name}".`
                            )
                        ]
                    });
                }
            }

            return;
        }

        const dbKey = `todo_${userId}`;

        const userData = await getFromDb(dbKey, {
            tasks: [],
            nextId: 1
        });

        if (!userData.tasks) userData.tasks = [];
        if (!userData.nextId) userData.nextId = 1;

        switch (subcommand) {
            case 'add': {
                const taskText = interaction.options.getString('task');

                const newTask = {
                    id: userData.nextId++,
                    text: taskText,
                    completed: false,
                    createdAt: new Date().toISOString()
                };

                userData.tasks.push(newTask);
                await setInDb(dbKey, userData);

                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        successEmbed(
                            "Задача добавлена",
                            `Задача "${taskText}" добавлена в ваш список дел.`
                        ),
                    ],
                });
            }

            case 'list': {
                if (userData.tasks.length === 0) {
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            successEmbed(
                                'Ваш список дел пуст!',
                                "Ваш список дел"
                            )
                        ],
                    });
                }

                const taskList = userData.tasks
                    .map(task =>
                        `${task.completed ? '✅' : '📝'} #${task.id} ${task.text}` +
                        `\`[${new Date(task.createdAt).toLocaleDateString()}\``
                    )
                    .join('\n');

                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        successEmbed(
                            'Ваш список дел',
                            taskList
                        )
                    ],
                });
            }

            case 'complete': {
                const taskNumber = interaction.options.getInteger('number');
                const task = userData.tasks.find(t => t.id === taskNumber);

                if (!task) {
                    return await replyUserError(interaction, {
                        type: ErrorTypes.UNKNOWN,
                        message: 'Задача не найдена.'
                    });
                }

                if (task.completed) {
                    return await replyUserError(interaction, {
                        type: ErrorTypes.UNKNOWN,
                        message: `Задача №${task.id} уже выполнена.`
                    });
                }

                task.completed = true;
                await setInDb(`todo_${userId}`, userData);

                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        successEmbed(
                            'Задача выполнена',
                            `Задача "${task.text}" отмечена как выполненная!`
                        )
                    ],
                });
            }

            case 'remove': {
                const taskNumber = interaction.options.getInteger('number');
                const taskIndex = userData.tasks.findIndex(
                    t => t.id === taskNumber
                );

                if (taskIndex === -1) {
                    return await replyUserError(interaction, {
                        type: ErrorTypes.UNKNOWN,
                        message: 'Задача не найдена.'
                    });
                }

                const [removedTask] = userData.tasks.splice(taskIndex, 1);
                await setInDb(`todo_${userId}`, userData);

                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        successEmbed(
                            'Задача удалена',
                            `Задача "${removedTask.text}" удалена из вашего списка дел.`
                        )
                    ],
                });
            }

            default:
                return await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'Недопустимая подкоманда.'
                });
        }
    },
};
