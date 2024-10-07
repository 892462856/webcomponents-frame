简体中文 | [English](https://www.npmjs.com/package/webcomponents-frame) 

# Web components frame

### 介绍
Web Components增强框架。核心是一个组件基类，提供响应式状态、作用域插槽、作用域样式和声明式模板系统；采用Proxy监听+细粒度更新策略。轻松、快速编写Web Component，可扩展、可插拔和跨框架。

### 安装
    npm install webcomponents-frame

### 指令集
-   ***:if***  = "返回bool值的表达式/属性"
-   ***:else-if*** = "返回bool值的表达式/属性"
-   ***:else***
-   ***:for*** = "(item,index,deep) in this.list" *(deep：递归绑定时的深度值；this.list：Array/Object/Number；item,index,deep可随意命名)*
-   ***:sub-for*** = "item.children" *(递归列表绑定)*
-   ***:show*** = "返回bool值的表达式/属性"
-   ***:model*** = "属性"
-   ***:slot-data*** = "obj"
-   ***:class*** = "{class1:true,class2:false}"
-   ***:style*** = "{borderWidth:'2px',borderColor:'#00f'}"
-   ***:attr*** = "this.propp/bool" *(element attrubite name)*
-   ***@event*** = "this.fu/expression"
-   ***@event.stop.prevent*** = "this.fu/expression"
-   ***:ref*** = "element ReferenceName"

### API
-   addEffector，nextTick，emitEvent

### 生命周期
-   attributeChangedCallback，constructor，initTemplate，connectedCallback，firstConnectedCallback，disconnectedCallback

### 使用示例
##### *> main.js*
```javascript
import { Component } from "webcomponents-frame"

class TextComponent extends Component{
  static observedAttributes = ['value','label','placeholder']
  attributeChangedCallback(name, oldValue, newValue) {
    this[name] = newValue
  }
  constructor(templateId = 'cmpt-text-template'){
    super(templateId)

    this.label = 'Label'
    this.labelSetting = {
      width: '4em',
      align: 'left'
    }
    this.value = ''
    this.placeholder = ''
    this.vertical = false
    this.styles = {
      borderRadius: '4px',
      borderColor: '#99f',
      borderSize: '8px',
    }
  }
  firstConnectedCallback(shadowRoot) {
    this.addEffector(()=>(this.value),{
      fn:(newValue,oldValue)=>{
        this.emitEvent('change',newValue)
      }
    })
  }
  get value(){}
  set value(v){}
  get label(){}
  set label(v){}
  get placeholder(){}
  set placeholder(v){}
  get labelSetting(){}
  set labelSetting(v){}
  get vertical(){}
  set vertical(v){}
  get styles(){}
  set styles(v){}
}

class TreeComponent extends Component{
  constructor(templateId = 'cmpt-tree-template'){
    super(templateId)

    this.list = [
      {name:'广东省',code:1,children:[
        {name:'广州市',code:11,children:[]},
        {name:'深圳市',code:12,children:[]},
        {name:'东莞市',code:13,children:[
          {name:'虎门镇',code:131,children:[]},
          {name:'厚街镇',code:132,children:[]}
        ]},
      ]},
      {name:'福建省',code:2,children:[]},
      {name:'浙江省',code:3,children:[
        {name:'杭州市',code:31,children:[]},
        {name:'温州市',code:32,children:[]},
      ]},
    ]
  }
  get list(){}
  set list(v){}
  submitValue($event,{item,i,d}){
    console.log($event,{item,i,d})
    
    this.emitEvent('select',item)
  }
}

class PageComponent extends Component{
  constructor(templateId = 'cmpt-page-template'){
    super(templateId)

    this.city = ''
    this.name = ''
  }
  get name(){}
  set name(v){}
  get city(){}
  set city(v){}
  setCity($event){
    const obj = $event.detail
    this.city = obj.name
  }
}

customElements.define('cmpt-text', TextComponent)
customElements.define('cmpt-tree', TreeComponent)
customElements.define('cmpt-page', PageComponent)


```
##### *> index.html*
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1" />
    <meta name="renderer" content="webkit" />
    <meta name="force-rendering" content="webkit" />
    <title>Web Component Plus框架演示</title>
  </head>
  <body>

    <cmpt-page></cmpt-page>

    <template id="cmpt-page-template">
      <style>
        :host{
          display: block;
          margin: auto;
          width: 400px;
          padding: 10px;
          background: #eef;
        }
        h3{
          display: inline-block;
        }
      </style>
      <cmpt-text :model="this.name" label="姓名" placeholder="请输入你的姓名"></cmpt-text>
      <div>
        <h3 class="city">选择城市：</h3>
        <span>{{this.city}}</span>
      </div>
      <cmpt-tree @select="this.setCity">
        <div slot="slot1" :slot-data="{item,i,d}">
          {{d}}|{{i}} {{item.name}}
        </div>
      </cmpt-tree>
    </template>
    <template id="cmpt-text-template">
      <style>
        :host > div{
          display: grid;
          grid-template-columns: ---this-labelSetting-width 1fr;
        }
        :host > div.vertical{
          grid-template-columns: 1fr !important;
        }
        label[align=---this-labelSetting-align]{
          text-align: ---this-labelSetting-align;
        }
      </style>
      <div :class="{vertical:this.vertical}" :style="{
        border:'1px solid #ccc',
        borderWidth: this.styles.borderSize,
        borderRadius: this.styles.borderRadius,
        borderColor: this.styles.borderColor,
      }">
        <label :align="this.labelSetting.align">{{this.label}}</label>
        <input :model="this.value" type="text" :placeholder="this.placeholder">
      </div>
    </template>
    <template id="cmpt-tree-template">
      <style>
        li,label{
          cursor: pointer;
        }
      </style>
      <ul>
        <li :for="(item,i,d) in this.list" @click.stop="this.submitValue($event,{item,i,d})">
          <slot name="slot1" :slot-data="{item,i,d}">
            <div>
              <label>{{d}}|{{i}}.</label>
              <label>{{item.code}}</label>
              <label>{{item.name}}</label>
            </div>
          </slot>
          <ul :sub-for="item.children"></ul>
        </li>
      </ul>
    </template>

    <script type="module" src="./main.js"></script>
  </body>
</html>

```
### 教程/文档
- 访问 [http://www.webcomponentsframe.com](http://www.webcomponentsframe.com)

### 源码
-  gitee [https://gitee.com/eljs/webcomponents-frame](https://gitee.com/eljs/webcomponents-frame)
-  github [https://github.com/892462856/webcomponents-frame](https://github.com/892462856/webcomponents-frame)

### License
MIT
