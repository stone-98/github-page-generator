const moment = require('moment');
moment.locale("zh-cn")

module.exports = {
    base: "/",
    // 导航栏标题
    title: "阿魁的知识星球",
    // 详情
    description: "",
    // SEO的配置
    head: [
      ['link',{ rel:'icon', href:'/assets/img/hero.png'}],
      ['meta', { name: 'author', content: '阿魁'}],
      ['meta', { name: 'keywords', content: '阿魁的知识星球'}],
    ],
    plugins: [
        [
          '@vuepress/last-updated',
          {
            transformer: (timestamp) => {
              // 不要忘了安装 moment
              return moment(timestamp).format("LLLL")
            }
          }
      ]
    ],
    themeConfig: {
      lastUpdated: '更新时间',
      // logo的配置
      logo: '/assets/img/logo.png',
      // 导航栏的配置
      nav: [
        { text: '首页', link: '/' },
        { text: '指南', link: '/guide/'},
        { 
          text: '代码',
          items: [
            { text: 'Dubbo', link : '/code/dubbo/'},
            { text: 'Nacos', ariaLabel: 'nacos', link: '/code/nacos/'}
          ]
        },
        { 
          text: '记录',
          ariaLabel: '记录',
          items: [
            { text: '总结', link : '/record/conclusion/'},
            { text: '感触', link: '/record/feeling/'}
          ]
        },
        { text: '关于', link: '/about' },
        { text: 'Github', link: 'https://github.com/stone-98' }
      ],

      // 侧边栏的配置
      sidebar: {
        '/code/': [
          '',
          'nacos',
          'dubbo'
        ],
        '/record/': [
          '',
          'conclusion',
          'feeling'
        ],

        // 暂时先注释掉，发现没有起作用
        // fallback
        // '/': [
        //   '',
        // ]
      }
    }
  }