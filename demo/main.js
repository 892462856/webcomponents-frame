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
