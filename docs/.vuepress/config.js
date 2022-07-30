const moment = require('moment');
moment.locale("zh-cn")

module.exports = {
    dest: "../../IdeaWorkSpace/stone-98.github.io/docs",
    base: "/",
    // 导航栏标题
    title: "阿魁的个人博客",
    // 详情
    description: "阿魁的个人博客",
    // SEO的配置
    head: [
      ['link',{ rel:'icon', href:'/assets/img/hero.png'}],
      ['meta', { name: 'author', content: '阿魁'}],
      ['meta', { name: 'keywords', content: '阿魁的个人博客'}],
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
        { 
          text: '编码',
          items: [
            { text: 'Dubbo', link : '/code/dubbo/'},
            { text: 'Nacos', link: '/code/nacos/'}
          ]
        },
        { 
          text: '生活',
          items: [
            { text: '运动', link : '/life/movement/'}
          ]
        },
        { text: '关于我', link: '/about' },
        { text: 'Github', link: 'https://github.com/stone-98' }
      ],

      // 侧边栏的配置
      sidebar: {
        '/code/': [
          // '',
          'nacos',
          'dubbo'
        ],
        '/life/': [
          // '',
          'movement'
        ],

        // 暂时先注释掉，发现没有起作用
        // fallback
        // '/': [
        //   '',
        // ]
      }
    }
  }