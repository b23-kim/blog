// 使用立即执行函数确保代码独立作用域
(function() {
  // 检查 chatroom 是否已定义，防止重复声明
  if (typeof window.chatroom === 'undefined') {
    window.chatroom = {
      userAvatarMap: new Map(),
      avatarIndex: 0,
      templateCache: new Map(),
      styleCache: new Set(),
      customClickHandlers: new Map(), // 存储自定义点击处理器
      templatesUrl: 'https://cdn.jsdmirror.com/gh/b23-kim/ChatRoom.js@main/ARKTemplates/', // 默认模板URL

      init: function (config) {
        if (!config || typeof config !== 'object') {
          console.error('Chatroom configuration is missing or invalid.');
          return;
        }

        const containerId = config.chatroomName;
        const jsonFilePath = config.jsonFilePath;
        const myAvatar = config.MyAvatar;
        // 新增：获取模板URL，有则用，没有则用默认
        this.templatesUrl = config.templatesUrl || this.templatesUrl;

        if (!containerId || !jsonFilePath || !myAvatar) {
          console.error('Chatroom name (containerId), JSON file path, and MyAvatar must be provided.');
          return;
        }

        const container = document.getElementById(containerId);
        if (!container) {
          console.error(`Chat container with id "${containerId}" not found.`);
          return;
        }

        // 检查是否已初始化
        if (container.dataset.chatroomInitialized === 'true') {
          console.log(`Chatroom with id "${containerId}" already initialized`);
          return;
        }

        // 标记为已初始化
        container.dataset.chatroomInitialized = 'true';
        // 存储配置到容器上，供PJAX重新初始化使用
        container.dataset.chatroomConfig = JSON.stringify(config);

        // 设置自定义点击事件委托
        this.setupCustomClickDelegation(container);

        this.loadChatData(jsonFilePath)
          .then((chatData) => {
            // 修改这里：使用异步生成内容
            this.generateChatContent(chatData, myAvatar, config.hideAvatar).then(chatContent => {
              if (document.getElementById(containerId)) {
                container.innerHTML = this.generateChatBoxHTML(chatContent, config.title || '群聊的聊天记录');
              }
            });
          })
          .catch((err) => {
            console.error('Error loading chat data:', err);
            // 移除标记，允许重试
            container.dataset.chatroomInitialized = 'false';
          });
      },

      // 新增：设置自定义点击事件委托
      setupCustomClickDelegation: function(container) {
        // 移除重复事件监听
        const existingListener = container.__chatroomClickListener;
        if (existingListener) {
          container.removeEventListener('click', existingListener, true);
        }
        
        const clickHandler = (e) => {
          const target = e.target.closest('[data-click-handler]');
          if (target) {
            e.preventDefault();
            e.stopPropagation();
            
            const handlerId = target.dataset.clickHandler;
            const params = target.dataset.clickParams ? JSON.parse(target.dataset.clickParams) : {};
            
            if (this.customClickHandlers.has(handlerId)) {
              this.customClickHandlers.get(handlerId).call(this, e, params, target);
            } else {
              console.warn(`Custom click handler "${handlerId}" not found`);
            }
          }
        };
        
        container.addEventListener('click', clickHandler, true);
        container.__chatroomClickListener = clickHandler; // 保存引用以便移除
      },

      loadChatData: function (filePath) {
        return fetch(filePath)
          .then((response) => {
            if (!response.ok) {
              throw new Error(`Failed to load chat data from ${filePath}`);
            }
            return response.json();
          });
      },

      generateChatBoxHTML: function (content, title) {
        const titleHtml = `<div class="chatBoxTitle"><i class="fa fa-chevron-left"></i><span class="chatTitleText">${title}</span><div class="chatBoxIcons"><i class="fa fa-group"></i><i class="fa fa-dedent"></i></div></div>`;
        return `<div class="chatContainer">${titleHtml}<div class="chatBox">${content}</div></div>`;
      },

      // 修改为异步函数
      generateChatContent: async function (chatData, myAvatar, hideAvatar) {
        let content = '';
        const sysProcessed = new Set();

        for (const chatItem of chatData) {
          if (chatItem.name && chatItem.name.toLowerCase() === 'sys') {
            content += this.generateSystemNotification(chatItem);
            sysProcessed.add(chatItem.content);
          } else if (!sysProcessed.has(chatItem.content)) {
            // 等待每个聊天项的处理完成
            content += await this.generateChatItem(chatItem, myAvatar, hideAvatar);
          }
        }

        return content;
      },

      // 修改为异步函数
      generateChatItem: async function (chatItem, myAvatar, hideAvatar) {
        let name = chatItem.name ? chatItem.name.trim() : '未知';
        let element = chatItem.element ? chatItem.element.trim() : 'Text';
        let content = chatItem.content ? chatItem.content : '无内容';
        let avatar = chatItem.avatar || null;

        const isMe = name.toLowerCase() === 'me';
        const chatName = isMe ? '我' : name;
        const chatClass = isMe ? 'me' : '';

        let avatarUrl;
        if (isMe) {
          avatarUrl = myAvatar;
        } else if (avatar && avatar.startsWith('http')) {
          avatarUrl = avatar;
        } else if (avatar && !isNaN(Number(avatar))) {
          avatarUrl = `https://q1.qlogo.cn/g?b=qq&nk=${avatar}&s=100`;
        } else {
          avatarUrl = this.assignAvatar(name);
        }

        const avatarHTML = hideAvatar
          ? ''
          : `<img class="chatAvatar no-lightbox" src="${avatarUrl}" onerror="this.src='https://via.placeholder.com/100';">`;

        // 处理不同类型的内容
        let processedContent;
        
        // 新增：处理 ARK 卡片类型
        if (element === 'ARK') {
          try {
            // 如果content是字符串，尝试解析为JSON
            if (typeof content === 'string') {
              content = JSON.parse(content);
            }
            // 等待异步操作完成
            processedContent = await this.generateARKCard(content);
          } catch (e) {
            console.error('Error parsing ARK card:', e);
            processedContent = `<div class="error">卡片解析失败: ${e.message}</div>`;
          }
          //提前返回，差异化处理
          return `
          <div class="chatItem ${chatClass}">
            ${avatarHTML}
            <div class="chatContentWrapper">
              <b class="chatName">${chatName}</b>
              <div>${processedContent}</div>
            </div>
          </div>
        `;
        } 
        // 处理普通文本
        else if (typeof content === 'string') {
          processedContent = this.parseContent(content.trim());
          if(content.includes("[:image::"))
          {  //这里没有chatContent这个div
            return `
          <div class="chatItem ${chatClass}">
            ${avatarHTML}
            <div class="chatContentWrapper">
              <b class="chatName">${chatName}</b>
              ${processedContent}
            </div>
          </div>
        `;
          }
        } 
        // 兜底：如果content既不是字符串也不是ARK，尝试转为字符串
        else {
          processedContent = typeof content === 'object' ? 
            JSON.stringify(content) : 
            String(content);
        }

        return `
          <div class="chatItem ${chatClass}">
            ${avatarHTML}
            <div class="chatContentWrapper">
              <b class="chatName">${chatName}</b>
              <div class="chatContent">${processedContent}</div>
            </div>
          </div>
        `;
      },
      
      // 重构：动态加载卡片模板
      generateARKCard: async function(cardData) {
        try {
          // 获取卡片类型和视图
          const app = (cardData.app || '').toLowerCase();
          const view = cardData.view || 'default';
          
          // 生成模板路径 - 使用配置的templatesUrl
          const templatePath = `${this.templatesUrl}${app}/${view}.html`;
          
          // 获取模板
          const template = await this.getTemplate(templatePath);
          
          // 填充模板数据
          return this.renderTemplate(template, cardData);
        } catch (e) {
          console.error('Error generating ARK card:', e);
          return `<div class="error">卡片生成失败: ${e.message || e.toString()}</div>`;
        }
      },
      
      // 新增：获取并缓存模板
      getTemplate: async function(templatePath) {
        // 检查缓存
        if (this.templateCache.has(templatePath)) {
          return this.templateCache.get(templatePath);
        }
        
        try {
          // 加载模板
          const response = await fetch(templatePath);
          if (!response.ok) {
            throw new Error(`Failed to load template from ${templatePath}`);
          }
          
          const templateHTML = await response.text();
          
          // 缓存模板
          this.templateCache.set(templatePath, templateHTML);
          
          // 自动加载关联样式
          this.loadTemplateStyles(templateHTML);
          
          return templateHTML;
        } catch (error) {
          console.error(`Error loading template ${templatePath}:`, error);
          // 失败时使用默认模板
          return this.getDefaultTemplate();
        }
      },
      
      // 新增：加载模板中的样式
      loadTemplateStyles: function(templateHTML) {
        // 创建临时DOM元素解析模板
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = templateHTML;
        
        // 查找所有样式标签
        const styleTags = tempDiv.querySelectorAll('style, link[rel="stylesheet"]');
        
        styleTags.forEach(tag => {
          const key = tag.outerHTML;
          
          // 检查样式是否已加载
          if (this.styleCache.has(key)) return;
          
          // 注入样式
          if (tag.tagName === 'STYLE') {
            const style = document.createElement('style');
            style.innerHTML = tag.innerHTML;
            document.head.appendChild(style);
          } else if (tag.tagName === 'LINK') {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = tag.href;
            document.head.appendChild(link);
          }
          
          // 缓存已加载样式
          this.styleCache.add(key);
        });
      },
      
      // 重构：渲染模板 - 支持 overwrite 字段和数组循环
// 重构：渲染模板 - 支持 overwrite 字段和数组循环
renderTemplate: function(template, data) {
  try {
    // 检查 overwrite 配置
    const overwrite = data.overwrite || {};
    const handlerId = overwrite.clickHandlerId || this.generateHandlerId();
    
    // 存储自定义点击处理函数
    if (overwrite.clickHandler) {
      this.customClickHandlers.set(handlerId, 
        new Function('e', 'params', 'element', `with(this) { ${overwrite.clickHandler} }`).bind(this)
      );
    }
    
    // 创建一个增强的上下文对象
    const enhancedContext = {
      ...data,
      __clickHandlerId: handlerId,
      __overwrite: overwrite
    };
    
    // 先处理循环，再处理变量
    let rendered = this.processTemplateLoops(template, enhancedContext);
    rendered = this.processTemplateVariables(rendered, enhancedContext);
    
    return rendered;
  } catch (e) {
    console.error('Error rendering template:', e);
    return `<div class="error">模板渲染失败: ${e.message}</div>`;
  }
},

// 重构：处理循环语法
processTemplateLoops: function(template, context) {
  let result = template;
  const eachRegex = /{{\s*#each\s+([^}]+)\s*}}([\s\S]*?){{\s*\/each\s*}}/g;
  
  let match;
  while ((match = eachRegex.exec(result)) !== null) {
    const [fullMatch, arrayPath, loopTemplate] = match;
    
    // 获取数组
    const array = this.getNestedValue(context, arrayPath);
    
    if (Array.isArray(array)) {
      let loopContent = '';
      
      array.forEach((item, index) => {
        // 为每个项目创建一个局部上下文
        const localContext = {
          ...context, // 包含外部上下文
          ...item,    // 当前项目的属性
          this: item, // 可以通过 'this' 访问当前项目
          '@index': index,
          '@first': index === 0,
          '@last': index === array.length - 1
        };
        
        // 处理循环模板中的变量
        let itemContent = this.replaceVariablesInTemplate(loopTemplate, localContext);
        loopContent += itemContent;
      });
      
      // 替换循环部分
      result = result.replace(fullMatch, loopContent);
      // 重置正则表达式以便继续搜索
      eachRegex.lastIndex = 0;
    } else {
      result = result.replace(fullMatch, '');
    }
  }
  
  return result;
},

// 新增：在模板中替换变量
replaceVariablesInTemplate: function(template, context) {
  return template.replace(/{{\s*([^}]+?)\s*}}/g, (match, key) => {
    key = key.trim();
    
    // 处理特殊变量
    if (key === '__clickAttrs') {
      const overwrite = context.__overwrite || {};
      if (overwrite.clickHandler) {
        const handlerId = context.__clickHandlerId;
        return `data-click-handler="${handlerId}" data-click-params='${JSON.stringify(overwrite.clickParams || {})}'`;
      }
      return '';
    }
    
    // 处理 this 关键字
    if (key === 'this') {
      return context.this ? JSON.stringify(context.this) : '';
    }
    
    // 获取值
    const value = this.getNestedValue(context, key);
    return value !== undefined && value !== null ? String(value) : '';
  });
},

// 重构：处理模板变量（用于非循环部分）
processTemplateVariables: function(template, context) {
  return this.replaceVariablesInTemplate(template, context);
},

// 重构：获取嵌套对象的值
getNestedValue: function(obj, path) {
  if (!path || !obj) return undefined;
  
  // 处理特殊变量
  if (['@index', '@first', '@last', '__clickHandlerId', '__overwrite'].includes(path)) {
    return obj[path];
  }
  
  // 分割路径
  const parts = path.split('.');
  let current = obj;
  
  for (const part of parts) {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }
    
    // 检查当前部分是否是数组索引
    const arrayIndexMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayIndexMatch) {
      const arrayName = arrayIndexMatch[1];
      const index = parseInt(arrayIndexMatch[2], 10);
      
      if (Array.isArray(current[arrayName]) && current[arrayName][index] !== undefined) {
        current = current[arrayName][index];
      } else {
        return undefined;
      }
    } else {
      // 普通属性访问
      if (current.hasOwnProperty(part)) {
        current = current[part];
      } else {
        return undefined;
      }
    }
  }
  
  return current;
},
      

      
      
      // 新增：生成唯一处理器ID
      generateHandlerId() {
        return `handler_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      },

      
      // 新增：默认模板
      getDefaultTemplate() {
        return `
          <div class="ark-card default-card">
            <div class="card-content">
              <h3>卡片加载异常</h3>
              <p>ARK内容显示失败</p>
            </div>
          </div>
          <style>
            .ark-card {
              border: 1px solid #e0e0e0;
              border-radius: 12px;
              overflow: hidden;
              background-color: #FFFFFF;
              box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
              margin: 12px 0;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            }
            .card-content {
              padding: 16px;
            }
            .card-footer {
              padding: 8px 16px;
              border-top: 1px solid #f0f0f0;
              background-color: #fafafa;
              font-size: 13px;
              color: #999;
            }
          </style>
        `;
      },

      generateSystemNotification: function (chatItem) {
        let content = chatItem.content;
        if (typeof content === 'string') {
          content = this.parseContent(content.trim());
        } else {
          content = JSON.stringify(content);
        }

        return `
          <div class="systemNotification">
            <div class="systemContent">${content}</div>
          </div>
        `;
      },

      parseContent: function (content) {
        // 保持原有特殊语法解析逻辑不变
        const imagePattern = /\[:image::(https?:\/\/[^\s]+?)::\]/g;
        const chatPattern = /\[:chat:\(([^)]+)\)::([^\s]+?)::\]/g;
        const linkPattern = /\[:a::(https?:\/\/[^\s]+?)::\]/g;
        const callPattern = /\[:call::@([^:]+?)::\]/g;
        const repPattern = /\[:rep:\[([^\]]+)\]:(.*?)::\]/g;

        content = content.replace(imagePattern, (match, p1) => {
          return `<img class="chatMedia" src="${p1}" alt="Image" />`;
        });

        content = content.replace(chatPattern, (match, title, jsonFilePath) => {
          const encodedTitle = encodeURIComponent(title);
          const encodedJsonFilePath = encodeURIComponent(jsonFilePath);
          const chatLink = `https://blog.awaae001.top/Chatroom/?jsonFilePath=${encodedJsonFilePath}&title=${encodedTitle}`;
          return `
            <div class="chatQuoteCard">
              <div class="chatQuoteTetle">
                <i class="fa fa-database"></i>
                <span>转发的聊天记录</span>
              </div>
              <a class="chatMessage" onclick="openChatWindow('${chatLink}')">转发自：${title}</a>
            </div>
          `;
        });

        content = content.replace(linkPattern, (match, p1) => {
          return `<a href="${p1}" class="chatLink" target="_blank">${p1}</a>`;
        });

        content = content.replace(callPattern, (match, username) => {
          return `<span class="chatCall">@${username}</span>`;
        });

        content = content.replace(repPattern, (match, username, quotedContent) => {
          return `
            <div class="chatQuote">
              <div class="quoteUser">
                <i class="fa fa-share-square-o"></i>
                <span>${username}</span>
              </div>
              <span class="quotedMessage">${quotedContent}</span>
            </div>
          `;
        });

        return content;
      },

      assignAvatar: function (name) {
        const avatars = [
          'https://i.p-i.vip/30/20240920-66ed9a608c2cf.png',
          'https://i.p-i.vip/30/20240920-66ed9b0655cba.png',
          'https://i.p-i.vip/30/20240920-66ed9b18a56ee.png',
          'https://i.p-i.vip/30/20240920-66ed9b2c199bf.png',
          'https://i.p-i.vip/30/20240920-66ed9b3350ed1.png',
          'https://i.p-i.vip/30/20240920-66ed9b5181630.png',
        ];

        if (!this.userAvatarMap.has(name)) {
          this.userAvatarMap.set(name, avatars[this.avatarIndex % avatars.length]);
          this.avatarIndex++;
        }
        return this.userAvatarMap.get(name);
      },

      // 新增：自动初始化所有聊天室
      autoInitAll: function() {
        // 查找所有聊天室容器
        document.querySelectorAll('[data-json-file]').forEach(element => {
          const config = {
            jsonFilePath: element.getAttribute('data-json-file'),
            templatesUrl: element.getAttribute('data-templates-url') || this.templatesUrl,
            chatroomName: element.id,
            MyAvatar: element.getAttribute('data-my-avatar'),
            title: element.getAttribute('data-title') || 'ChatRoom.js',
            hideAvatar: element.getAttribute('data-hide-avatar') === 'true'
          };
      
          if (config.jsonFilePath && config.MyAvatar) {
            this.init(config);
          }
        });
      }
    };
  }

  // 聊天窗口打开函数
  window.openChatWindow = function (url) {
    window.open(url, '_blank', 'width=450,height=650,scrollbars=yes');
  };

  // 自动初始化函数 - 在DOM加载完成后执行
  function initializeChatrooms() {
    if (window.chatroom && typeof window.chatroom.autoInitAll === 'function') {
      window.chatroom.autoInitAll();
    }
  }

  // 当DOM加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeChatrooms);
  } else {
    // DOM已经加载完成，立即初始化
    setTimeout(initializeChatrooms, 0);
  }

  // PJAX支持
  document.addEventListener('pjax:complete', function() {
    // 重新初始化所有聊天室
    setTimeout(initializeChatrooms, 0);
  });

  // Turbolinks支持
  document.addEventListener('turbolinks:load', function() {
    setTimeout(initializeChatrooms, 0);
  });

  // 兼容旧版初始化方式 - 通过全局变量传递配置
  if (typeof window.chatroomInitConfig !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function() {
      if (window.chatroom && typeof window.chatroom.init === 'function') {
        window.chatroom.init(window.chatroomInitConfig);
      }
    });
  }

  // 兼容旧版初始化方式 - 直接调用chatroom.init
  if (window.chatroom && typeof window.chatroom.init === 'object') {
    document.addEventListener('DOMContentLoaded', function() {
      if (window.chatroom && window.chatroom.init && typeof window.chatroom.init === 'object') {
        window.chatroom.init(window.chatroom.init);
      }
    });
  }
})();
