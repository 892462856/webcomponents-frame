//abstract版本
import { Effector } from './component.effector.js'
import { cloneComponent, addEventListenerWithCanceller, insertAfter, toHump, extractVarNamesByDeconstruct } from './component.utility.js'

console.log('base')
//#region slot-template要优化，取消不必要的template调用

const CompletingClass = (function(){
  const reviseRecord = new WeakMap()
  /**
  * 修饰CustomHTMLElement子类：1.给函数体为空的get/set加上默认的函数体；
  * @param {Component} Class
  * @returns Class
  */
  return function(customClass){
    if(reviseRecord.get(customClass)) return

    /**浏览器系统原因，没法将实例属性转为原型属性
    if(customClass.name === 'CustomHTMLHZFTextElement'){
      debugger
      Reflect.defineProperty(customClass.prototype, 'list2',{
        configurable: false,
        enumerable: true,
        get(){
          return this._getProp('list2')
        },
        set(v){
          this._setProp('list2')
          return true
        }
      })
    }
    */

    const parentClass = Reflect.getPrototypeOf(customClass)
    if(parentClass !== HTMLElement){
      CompletingClass(parentClass)
    }
    const keys = Reflect.ownKeys(customClass.prototype)
    keys.forEach(ownKey=>{
      let oper = false
      let desc = Reflect.getOwnPropertyDescriptor(customClass.prototype,ownKey)
      if(desc.get){
        const match = desc.get.toString().match(Regulars.getter)
        if(match){
          const content = match[1].replace(Regulars.ann,'').trim()
          if(content === ''){ //如果代码区为空
            desc.get = function(){
              return this._getProp(ownKey)
            }
            oper = true                          
          }else if(Regulars.cached.test(content)){ //如果get代码区的第一行有cached字符 
            const fn = desc.get
            desc.get = function(){
              {
                if(!this[getFnCacheSymbol]) this[getFnCacheSymbol] = {}
                if(!this[getFnCacheSymbol][ownKey]){                                 
                    this[getFnCacheSymbol][ownKey] = fn.bind(this)
                    this.addEffector(this[getFnCacheSymbol][ownKey],{
                      fn:(newValue,oldValue)=>{
                        this._setProp(ownKey, newValue)
                      }
                    },{immediate: true})
                }
              }
              return this._getProp(ownKey)
            }
            oper = true
          }                        
        }
      }
      if(desc.set){
        const match = desc.set.toString().match(Regulars.setter) //要改：要排除 注释，再match。
        if(match){
          const content = match[2].replace(Regulars.ann,'').trim()
          if(content === ''){
            desc.set = function(v){
              return this._setProp(ownKey,v) //JS原生规定：属性的set函数必须return true表示set成功，不然会抛出错误。
            }
            oper = true
          }
        }
      }        
      if(oper){
        Reflect.defineProperty(customClass.prototype, ownKey,desc)
      }
    })
    reviseRecord.set(customClass,true)
    return customClass
  }
})()

const Regulars = Object.freeze({
    text: /\{\{(.+?)\}\}/gi,
    text_simple: /^\{\{([^}]+?)\}\}$/,
    // css: /---(.+?)\b/gi,
    css: /---((\w|\d|-)+)/gi,
    attr: /\$\{.+?\}/gi,
    value: /^(\w+(\["\w+?"\]|\['\w+?'\]|\[\d+?\])?(\.|$))*$/,//\w有个问题，不支持$符号，后面再改
    for: /^\s*(.+?)\s+in\s+(.+)\s*$/, //不严谨，要不要改？
    for_items: /^(\((.+)\)|([^(].*[^)]?))$/,
    for_list: /^(\((.+)\)|([^(].*[^)]?))$/,
    // for: /^(\s*\(\s*(\w+?)\s*,\s*(\w+?)\s*\)\s+in\s+(.+)\s*|\s*\(\s*(\w+?)\s*\)\s+in\s+(.+)\s*|\s*(\w+?)\s+in\s+(.+)\s*)$/, // (item,i) in list, 2:item,3:1,4:list；item in list，5:item,6:list。
    // each: /^\((.+?)\)\s+in\s+(.+)\s*$/,   //不严谨，要改
    ann: /(\/\*(.|\r|\n)*?\*\/|\/\/.*)/gi,          //注释,多行、单行 $1:注释内容
    getter: /^.+\{((.|\n|\r)*?)\}\s*$/,             //get属性设置器 $1:{}内的代码
    setter: /^.+\((.+)\)\s*\{((.|\n|\r)*?)\}\s*$/,  //set属性设置器 $1:参数名（就一个）；$2:{}内的代码
    cached: /^\s*('|"|`)cached\1.*?\r/i,        //使用proxy缓存
    ternaryOperator: /(\?\.|[^?]+\?[^:]+:.+)/,             //三目运算符(只是最简单的判断，需完善)
    if: /[^if]+if.+/                                //if运算符(只是最简单的判断，需完善)
})//@正则表达式都不严谨，要改的

const templateDataCacheHelper = new Map()
const effector = new Effector()
const eventHandleCreatorMap = {}
// window._efs = {effector,eventHandleCreatorMap} //调试用

function updateElement(rule, el, value){
  const { type, name, humpName, expr } = rule
  const valueString = (value === undefined || value === null) ? '' : value

  if(type === 'css'){
    el.textContent = value
  }else if(type === 'attr'){
    if(name === 'model'){
      if(el.constructor === HTMLInputElement){
        const elType = el.type.toLowerCase()
        if(elType === 'checkbox'){
          if(typeof(value) !== 'boolean' && (!value || value.constructor !== Array)){
            console.log(el, rule, value)
            throw Error(`checkbox的:model绑定属性 必须是数组或boolean类型。\n当前是${value ? value.constructor : typeof(value)}类型，表达式：${expr}`)
          }
          if(value.constructor === Array){
            if(value.includes(el.value)){
              el.setAttribute('checked','')
              el.checked = true
            }else{
              el.removeAttribute('checked')
              el.checked = false
            }
          }else{
            if(value){
              el.setAttribute('checked','')
              el.checked = true
            }else{
              el.removeAttribute('checked')
              el.checked = false
            }
          }
        }else if(elType === 'radio'){
          if(el.value == value){
            el.setAttribute('checked','')
            el.checked = true
          }else{
            el.removeAttribute('checked')
            el.checked = false
          }
        }else{
          el.value = valueString
        }
      }else{
        el.value = valueString
      }
    }else if(name === 'class' && value && value.constructor === Object){ //允许class以object的形式书写
        const classs = Object.entries(value).filter(t=>t[1]).map(t=>t[0])
        el.setAttribute(name, classs.join(' '))
    }else if(name === 'style' && value && value.constructor === Object){ //允许style以object的形式书写
      const style = Object.entries(value).map(([key,val])=>{
        if((/[A-Z]/).test(key)){
          key = key.replace(/([A-Z])/g,a=>{return `-${a.toLowerCase()}`})
        }
        return `${key}:${val}`
      })
      el.setAttribute(name, style.join(';'))
    }else{
      if(el.nodeName.includes('-') && (name in el || humpName in el)){//优先设置“属性”，“attribute”次之
        el[humpName || name] = value
      }else{
        if(value === false || value === undefined || value === null){
          el.removeAttribute(name)
        }else{
          const attrValue =  typeof(valueString) === 'object' ? JSON.stringify(valueString) : valueString
          el.setAttribute(name,attrValue)
        }
      }
    }
  }else if(type === 'text'){
    el.textContent = valueString
  }
}

function throwError(msg,constructorName,el){
    throw Error(`${msg}！\n错误来自组件“${constructorName}”的模板 ${el.outerHTML}`)
}

/**
 * 生成事件处理函数
 */
const createEventConstraintCode = (function(){
  const codeMap = Object.freeze({
    "common": Object.freeze({
        "self": "if($event.target !== el) return",
        "passive": "$event.passiveDefault()",
        "prevent": "$event.preventDefault()",
        "stop": "$event.stopPropagation()"
    }),
    "inexact": Object.freeze({
        "meta": "if(!$event.metaKey) return",
        "alt": "if(!$event.altKey) return",
        "ctrl": "if(!$event.ctrlKey) return",
        "shift": "if(!$event.shiftKey) return"
        // "left": "if($event.buttons !== 0) return",
        // "right": "if($event.buttons !== 2) return",
        // "middle": "if($event.buttons !== 1) return",
        // "backward": "if($event.buttons !== 3) return",
        // "forward": "if($event.buttons !== 4) return",
    }),
    "exact": Object.freeze([
        [
            "meta",
            "if($event.metaKey) return"
        ],
        [
            "alt",
            "if($event.altKey) return"
        ],
        [
            "ctrl",
            "if($event.ctrlKey) return"
        ],
        [
            "shift",
            "if($event.shiftKey) return"
        ]
        // [
        //     "left",
        //     "if($event.buttons === 0) return"
        // ],
        // [
        //     "right",
        //     "if($event.buttons === 2) return"
        // ],
        // [
        //     "middle",
        //     "if($event.buttons === 1) return"
        // ],
        // [
        //     "backward",
        //     "if($event.buttons === 3) return"
        // ],
        // [
        //     "forward",
        //     "if($event.buttons === 4) return"
        // ]
    ]),
    "press": Object.freeze({//keydown,keypress,keyup
        "inexact": Object.freeze({
            "delete": "if(($event.code+'').toLowerCase() !== 'delete') return",
            "tab": "if(($event.code+'').toLowerCase() !== 'tab') return",
            "home": "if(($event.code+'').toLowerCase() !== 'home') return",
            "end": "if(($event.code+'').toLowerCase() !== 'end') return",
            "pageup": "if(($event.code+'').toLowerCase() !== 'pageup') return",
            "pagedown": "if(($event.code+'').toLowerCase() !== 'pagedown') return",
            "enter": "if(($event.code+'').toLowerCase() !== 'enter') return",
            "esc": "if(($event.code+'').toLowerCase() !== 'esc') return",
            "space": "if(($event.code+'').toLowerCase() !== 'space') return"
        }),
        "exact": Object.freeze([
            [
                "delete",
                "if(($event.code+'').toLowerCase() === 'delete') return"
            ],
            [
                "tab",
                "if(($event.code+'').toLowerCase() === 'tab') return"
            ],
            [
                "home",
                "if(($event.code+'').toLowerCase() === 'home') return"
            ],
            [
                "end",
                "if(($event.code+'').toLowerCase() === 'end') return"
            ],
            [
                "pageup",
                "if(($event.code+'').toLowerCase() === 'pageup') return"
            ],
            [
                "pagedown",
                "if(($event.code+'').toLowerCase() === 'pagedown') return"
            ],
            [
                "enter",
                "if(($event.code+'').toLowerCase() === 'enter') return"
            ],
            [
                "esc",
                "if(($event.code+'').toLowerCase() === 'esc') return"
            ],
            [
                "space",
                "if(($event.code+'').toLowerCase() === 'space') return"
            ]
        ])
    })
  })

  return function createCode({embellishs,eventName}){
    const isExact = embellishs.includes('exact')
    const isPress = ['keydown','keypress','keyup'].includes(eventName)
    let codes
    if(isPress){
      codes = embellishs.map(key=>codeMap.press.inexact[key]).filter(t=>t)
      // if(isExact && codes.length){
      //     codes = codes.concat(codeMap.press.exact.filter(([key])=>!embellishs.includes(key)).map(([key,code])=>code))
      // }
    }else{
      codes = embellishs.map(key=>codeMap.inexact[key]).filter(t=>t)
      if(isExact && codes.length){
          codes = codes.concat(codeMap.exact.filter(([key])=>!embellishs.includes(key)).map(([key,code])=>code))
      }
    }
    const codes2 = embellishs.map(key=>codeMap.common[key]).filter(t=>t)
    return codes.concat(codes2)
  }
    /**
    .stop.prevent.capture.self.once.passive
    .exact 
    .left.right.middle,backward(鼠标侧键-后退)，forward(鼠标侧键-前进)
    exact:精确的 
    keyboard: delete,tab,home,end,pageup,pagedown,enter,esc,space
    ，metaKey，altKey ctrlKey shiftKey
    */
})()
const createEventHandle = function(fullName){
  let eventBinder = eventHandleCreatorMap[fullName]
  if(eventBinder) return eventBinder

  const embellishs = fullName.split('.')
  const eventName = embellishs.shift()
  const isCapture = embellishs.includes('capture')
  // function reset(enable){}//可以控制 启用/禁止 事件

  let handler
  if(embellishs.length){
    const codes = createEventConstraintCode({embellishs,eventName})
    handler = Function('el,$event,fn,listener,contextVars',`
      ${codes.join('\n;')};
      ${embellishs.includes('once') ? `el.removeEventListener('${eventName}', fn, ${isCapture});` : ''};
      listener.call(this,$event,contextVars)
    `)
  }else{//大多数embellishs为空，所以这里可以跳过，提高性能。
    handler = function(el,$event,fn,listener,contextVars){
      listener.call(this,$event,contextVars)
    }
  }

  const removerKey = `_removeEventListener_${fullName}`

  eventBinder = function(el,listener,contextVars){
    el[removerKey] && el[removerKey]()

    const fn = ($event)=>{
      handler.call(this,el,$event,fn,listener,contextVars)
    }
    el[removerKey] = addEventListenerWithCanceller(el,eventName, fn, isCapture)
  }//通过this调用： eventBinder.call(this,参数……)
  eventHandleCreatorMap[fullName] = eventBinder
  
  return eventBinder
}
const createModelBind = (function(){
  const removerKey = `___addEventListener_updateModel`
  function getGroupValue(el,getValue,contextVars){
    let value = getValue.call(this,contextVars)
    if(!value || value.constructor !== Array){
      value = []
    }else{
      value = [...value]
    }
    if(el.checked){
      value.push(el.value)
    }else if(value.includes(el.value)){
      value.splice(value.indexOf(el.value),1)
    }
    return value
  }
  return function(el,eventName,getValue,setValue,contextVars){
    el[removerKey] && el[removerKey]()
    
    let handler
    const inputType = (el.type || el.nodeName).toLowerCase()

    if(el.constructor === HTMLInputElement && inputType === 'checkbox'){
      const hasValueAttr = el.hasAttribute('value')
      if(hasValueAttr){//如果设置了value attribute，则是多选项，value是数组
        handler = (e)=>{
          const value = getGroupValue.call(this,el,getValue,contextVars)
          setValue.call(this,value,contextVars)
        }
      }else{//如果未设置value attribute，则是单选项，value是单个值
        handler = (e)=>{ 
          setValue.call(this,el.checked,contextVars)
        }
      }
    }else{
      handler = (e)=>{
        setValue.call(this,el.value,contextVars)
      }
    }//后面再试试提取handler内存会不会再少。

    if(!eventName){
      eventName = (el.constructor === HTMLTextAreaElement || (el.constructor === HTMLInputElement && ['hidden','number','password','range','tel','text','url'].includes(inputType))) ? 'input' : 'change'
    }    
    el[removerKey] = addEventListenerWithCanceller(el,eventName, handler)
  }
})()//给组件调用，createModelBind.call(this,el,……)，传入this

/**
 * 移除每一个el,并且解散nodes
 * @param {Array} nodes element数组
 */
function clearByNodes(nodes){
  if(nodes.constructor === Array){
    // const list = target.flat(Infinity)
    // while(list.length){
    //   list.pop().remove()
    // }
    while(nodes.length){
      const nodes2 = nodes.pop()
      clearByNodes(nodes2)
    }
  }else{        
    nodes.remove()
  }
}

const cloneFragment = function(fragments,sign){
  const el = fragments[sign]
  const el2 = el.cloneNode(true)
  el2[mapKey] = el[mapKey]
  return el2
}

const mapKey = '@map'
const signFinder = Object.freeze({
  createSignMap: function(el,parentMap){
    const map = {}
    map.parent = parentMap && (parentMap.constructor === WeakRef ? parentMap : new WeakRef(parentMap))
    el.querySelectorAll('[sign]').forEach(el=>{
      const sign = el.getAttribute('sign')
      map[sign] = el
    }) //用querySelectorAll查找 来建立sign映射
    // Object.entries(el[mapKey]).forEach(([sign,indexs])=>{
    //   /**
    //    * 用indexs查找 来建立sign映射；
    //    * 应该比querySelectorAll快吧；
    //    * 经测试，HTMLCollection增多4.9M，不好。Element.children=动态HTMLCollection，可能是这里增加了内存。
    //    */
    //   map[sign] = indexs.reduce((el,index)=>(el.children[index]),el)
    // })

    el[mapKey] = map
    return el
  },
  toCommentBySign(sign,map){
    const target = map[sign]
    if(target.constructor === Array){
      signFinder.toCommentByNodes(target)
    }else{
      const comment = signFinder._toComment({el:target,sign})
      map[sign] = comment
    }
  },
  toCommentByNodes(nodes){
    let list, el = nodes
    while(el.constructor === Array){
        list = el
        el = list[0]
    }//找出第一个el
    list.shift() //防止下面remove（clearByNodes(nodes)）时误把el从页面删掉：如果comment===el，既_toComment未做任何操作。

    const comment = signFinder._toComment({el})

    clearByNodes(nodes)
    nodes[0] = comment
  },
  _toComment({el, sign = 'sign'}){
    if(el.constructor === Comment) return el

    const comment = document.createComment(sign)
    el.parentNode.replaceChild(comment,el)

    if(el[mapKey]){
      comment[mapKey] = {
        parent: el[mapKey].parent
      }
      delete el[mapKey].parent
      delete el[mapKey]
    }

    return comment
  },
  toElementBySign(map,sign,tempData,templateSign){
    const comment = map[sign]
    if(comment.constructor === Array){
      return signFinder.toElementByNodes(comment,tempData,templateSign)
    }else{
      const el =  signFinder._toElement({tempData,templateSign,comment, map})
      map[sign] = el
      return el
    }
  },
  toElementByNodes(nodes,tempData,templateSign){
    let list = nodes, comment = list[0] // nodes[0]也可能是一个Array
    while(comment.constructor === Array){
      list = comment
      comment = list[0]
    }//找到第一个el
    if(comment.constructor !== Comment && comment.nodeName !== 'JOINT'){
      const el = comment
      if(!el[mapKey]){ //什么情况会出现？？——slot-template第一个el 会出现这种情况
        signFinder.createSignMap(el)
      }
      return el //初始化时，for的element是<joint sign='xx'><joint>，需要toComment。
    }else{
      const el = signFinder._toElement({tempData,templateSign,comment})
      list[0] = el //注意：el在nodes中的位置
      return el
    }
  },
  _toElement({comment,tempData,templateSign, map}){
    const el = cloneFragment(tempData.fragments,templateSign)
    comment.parentNode.replaceChild(el,comment)
    
    map = map || comment[mapKey]?.parent
    delete comment[mapKey]

    return signFinder.createSignMap(el,map)
  },
  appendForItem(nodes,index,tempData,sign){
    let preEl = nodes[index-1]
    while(preEl.constructor === Array){
      preEl = preEl[preEl.length - 1]
    }//找到位置最后的一个

    const el = cloneFragment(tempData.fragments,sign)    
    insertAfter(preEl.parentNode,el,preEl)//上一个之后插入

    nodes.push(el)

    return signFinder.createSignMap(el)
  }
})

const componentReactObjMap = new WeakMap()
const getFnCacheSymbol = Symbol('getFnCacheSymbol')
const slotsSymbol = Symbol('slots')

const getValueVsEmpty = function(value){
  return value === null || value === undefined ? '' : value
}
const toListFor = function(list){
  if(list.constructor === Number){//使for支持number，如：:for="(n,j) in 20",n从1开始，j从0开始。
    const result = []
    for(let i = 0; i < list; i++){
      result[i] = i+1
    }
    return result
  }else if(list.constructor === Object){//使for支持object，如：for="(item,j) in obj",obj={xx:13,yy:'dd'},item=[key,value]
    return Object.entries(list)
  }else{
    return list // list._isProxy ? list.map(t=>t) : list
  }                
}

//#endregion

//#region 

class Component extends HTMLElement {
  static{}
  constructor(componentTemplateId) {
    super()
    CompletingClass(this.constructor) //子类的初始化

    this.#reactor.obj = componentReactObjMap.get(this) || effector.createProxy() //设置公共属性的proxy；但它可能已经在CustomHTMLElement.constructor运行前就已在读写HTMLElement扩展属性时创建
    componentReactObjMap.set(this,this.#reactor.obj)

    if(!templateDataCacheHelper.get(this.constructor)){//每个类 执行一次就可以了，无需每个实例都执行
      const templateContent = document.getElementById(componentTemplateId).content.cloneNode(true) // DocumentFragment

      this.initTemplate(templateContent)
      
      Component.#templateParsing(templateContent, this.constructor)
    }//或者放在static constructor里，如果JS支持这个语法。
  }
  /**
   * 移除时，清理effects里和自己有关的值
   */
  disconnectedCallback() {
    if(this.isConnected) return
    
    {
      this.#removeEffector(this.#reactor.tree)
      this.#reactor.tree = []
      delete this[getFnCacheSymbol]
      this.#connected = false
    }//清空tree/getFnCacheSymbol，重置#connected = false

    if(typeof(this._clearMessageListener) === 'function'){
      this._clearMessageListener()
    }//清除MessageListener
  }
  connectedCallback(){
    if(!this.#attached){//每个实例执行一次
      this.#attached = true
      this.#shadowRoot = this.attachShadow({ mode: 'closed' })
      const parsedTemplate = templateDataCacheHelper.get(this.constructor).template
      const templateContent = parsedTemplate.cloneNode(true)
      this.#shadowRoot.appendChild(templateContent)
      this.#shadowRoot[mapKey] = parsedTemplate[mapKey]
    }
    if(!this.#connected){//附加到 文档树 时
      this.#connected = true
      Component.#templateBinding(this.constructor)(this,this.#shadowRoot)
      this.firstConnectedCallback(this.#shadowRoot)
    }
  }
  firstConnectedCallback(shadowRoot){}
  initTemplate(templateContent){}
  #attached = false
  #connected = false
  #shadowRoot = undefined
  #reactor = {
      obj: undefined,
      tree: [],
      refs: []
  }
  globalExecute({name,params}){
    let data
    this.dispatchEvent(new CustomEvent('globalExecute', {
      bubbles: true,
      composed: true,
      cancelable: false,
      detail: {name,params,callback:(d)=>{data = d}}
    }))
    return data
  }
  /**
   * 全局“响应式数据”；基于customEvent实现，所以只有this加载到dom树后才能获取到
   */
  get rootData(){
      return this.globalExecute({name: 'rootData'})
  }
  /**
   * 解析模板，一类组件只解析一次，实例公用。
   * @param {*} template sign:对应每个el；id:对应每个绑定，一个el可能有多个绑定。
   * @returns 
   */
  static #templateParsing(template, constructor){
    if(templateDataCacheHelper.get(constructor)) return //一种组件的模板只解析一次

    let id_x = 1
    const createId = ()=>(`id${(++id_x)}`)
    let sign_x = 1 //还可优化：局部sign？
    const createSign = ()=>(`s${(++sign_x)}`) //sign字符串在不同组件中服用，减少内存；字符串池机制；少用random

    const bindRules = []
    function parsingHtml({parentEl, fragments, parentId = undefined, eachIds = [], indexMap}){
      // if(el.children.length === 0) return fragments //避免remove掉文本      
      const isComponmentForParent = parentEl.constructor === DocumentFragment ? false : parentEl.nodeName.includes('-') // Component.prototype.isPrototypeOf(el.parentElement)写法的问题：parentElement可能未初始化，所以不一定为Component

      let curEachIds = []
      let index = -1
      const nodes = [...parentEl.childNodes]//el.childNodes在这里是实时的，必须转为Array，forEach里remove Text才不会影响顺序。
      nodes.forEach((node)=>{
        if(node.constructor === Text){
          if(node.data.replaceAll('\n','').trim() === ''){//有点性能问题，可不可以不用replaceAll
            node.remove()
          }
          return
        }//移除el和el之间的空格，节省浏览器内存
        if(node.constructor === HTMLBRElement) return

        const el = node

        let jointNode = []
        let elseNode = undefined
        let modelRule = undefined
        let sameSign = false // 是否 跟上一个rule同属一个el
        let pid = parentId
        let operation = 0
        const sign = el.getAttribute('sign') || createSign() //对应一个el
        const attrs = el.attributes
        //注意：下面attr的处理顺序决定了处理的优先级，即包含关系：同级绑定，优先处理if->for->其它（:model绑定在所以 属性绑定之后处理，因为model绑定的值双向传递！）                
        const ifAttr = attrs.getNamedItem(':if')               
        if(ifAttr){
          const id = createId()
          const elseAttrs = [{sign, id, mode:ifAttr.name.slice(1), attr: ifAttr}]
          let sibEl = el
          while(true){
              sibEl = sibEl.nextElementSibling
              if(!sibEl) break
              
              let elseAttr = sibEl.attributes.getNamedItem(':else-if') || sibEl.attributes.getNamedItem(':else')
              if(!elseAttr) break

              const sibSign = createSign()
              const sibId = createId()
              sibEl.setAttribute('sign', sibSign)
              sibEl.setAttribute('else_id', sibId)
              elseAttrs.push({sign: sibSign, id: sibId, mode: elseAttr.name.slice(1), attr: elseAttr})
              if(elseAttr.name === ':else') break
          }
          const exprs = elseAttrs.map(({sign, id, mode, attr})=>(Object.freeze({sign, id, mode, expr:attr.value})))
          Object.freeze(exprs)
          bindRules.push({type:'if', id, pid, sign, sameSign, exprs})
          attrs.removeNamedItem(ifAttr.name)
          sameSign = true
          pid = id
          operation = 1
          jointNode.push('if')
        }//处理if绑定

        const elseAttr = attrs.getNamedItem(':else') || attrs.getNamedItem(':else-if')
        if(elseAttr){
          elseNode = el
          const sign = el.getAttribute('sign')
          const id = el.getAttribute('else_id')
          if(!sign || !id){
            throwError('else-if绑定语法错误，必须先在上一个节点绑定if才能在当前节点绑定else-if或else！',constructor.name,el)
          }
          if(sameSign){
            throwError('else前面不能再出现if。',constructor.name,el)
          }
          bindRules.push({type:'elseif', id, pid, sign, sameSign})
          attrs.removeNamedItem(elseAttr.name)
          attrs.removeNamedItem('else_id')
          sameSign = true
          pid = id
          fragments[sign] = el
          // operation = 1 处理:if时已经添加sign了
        }//处理else-if和else

        let layer = 0
        const forAttrs = [attrs.getNamedItem(':for'),attrs.getNamedItem(':forB')].filter(t=>t)
        forAttrs.forEach((forAttr)=>{
          layer = layer + 1
          const varsMatch = forAttr.value.match(Regulars.for)
          if(!varsMatch){
            throwError(`for绑定语法错误:for="${forAttr.value}"。`,constructor.name,el)
          }
          let vars
          {
            const itemStr = varsMatch[1].match(Regulars.for_items)
            const listStr = varsMatch[2].match(Regulars.for_list)
            if(!itemStr || !listStr){
              throwError(`for绑定语法错误:for="${forAttr.value}"。`,constructor.name,el)
            }
            const list = listStr[2] || listStr[3]
            const items = (itemStr[2] || itemStr[3]).split(',')
            if(items.length > 3){
              throwError(`for绑定语法错误:for="${forAttr.value}"。`,constructor.name,el)
            }
            vars = Object.freeze({
              list,
              item: items[0],
              index: items[1],
              deep: items[2]
            })
          }//提取vars
          const id = createId()
          bindRules.push({type:'for', id, pid, layer, sign, sameSign, vars, temp: forAttr.value})
          attrs.removeNamedItem(forAttr.name)
          curEachIds.push(id)
          sameSign = true
          pid = id
          operation = 1
          jointNode.push('for')
        })//处理for绑定

        const subForAttr = attrs.getNamedItem(':sub-for')
        if(subForAttr && subForAttr.value){
          if(el.children.length > 0){
            throwError(`:sub-for节点不允许包含内容！`,constructor.name,el)
          }
          const expr = subForAttr.value
          const eachId = eachIds.pop()
          if(!eachId){
            throwError(`:sub-each节点没有上层:for节点！`,constructor.name,el)
          }
          const id = createId()
          bindRules.push({type:'sub-for', id, pid, eachId, sign, sameSign, expr})
          attrs.removeNamedItem(subForAttr.name)
          // sameSign = true sub-each不能设置sameSign
          operation = 1
        }//处理:sub-for

        if(isComponmentForParent && el.constructor !== HTMLSlotElement){//children会有很多，要优化。
          const nameAttr = attrs.getNamedItem(':slot')
          const dataAttr = attrs.getNamedItem(':slot-data')
          if(nameAttr && !nameAttr.value.trim()){
              throwError(`:slot-name的值不能为空！`,constructor.name,el)
          }
          const name = nameAttr?.value ? Object.freeze({expr: nameAttr.value}) : (attrs.getNamedItem('slot')?.value || '')
          const data = dataAttr?.value
          nameAttr && attrs.removeNamedItem(nameAttr.name)
          dataAttr && attrs.removeNamedItem(dataAttr.name)
          const isDataUnpack = data ? data.charAt(0) === '{' : false //是否解构了data
          if(isDataUnpack && data.charAt(data.length - 1) !== '}'){
            throwError(`:slot-data的值解构语法错误！`,constructor.name,el)
          }
          let decoVarNames
          if(isDataUnpack){
            decoVarNames = extractVarNamesByDeconstruct(data)
            if(decoVarNames.length === 0){
              throwError(`:slot-data的值解构不能是空的！`,constructor.name,el)
            }
          }

          layer = layer + 1
          const id = createId()
          bindRules.push({type:'slotTemplate', id, pid, layer, sign, sameSign, name, data, decoVarNames})
          pid = id
          sameSign = true
          operation = 1
          fragments[sign] = el
        }//处理 slot-template                

        if(el.constructor === HTMLSlotElement){
          let single = true
          if(pid){
            let prePid = pid
            while(prePid){
              const parentRule = bindRules.find(t=>t.id === prePid)
              if(parentRule.type === 'for'){
                  single = false
                  break
              }
              prePid = parentRule.id
            }
          }//设置single    
          const name = attrs.getNamedItem('name')?.value || '' //slot的name不支持动态绑定
          const dataAttr = attrs.getNamedItem(':slot-data')
          if(!single || (dataAttr && dataAttr.value)){
            const data = dataAttr?.value
            const id = createId()
            bindRules.push({type:'slot', id, pid, sign, sameSign, single, name, data})
            operation = 1
          }else{
            bindRules.push({type:'slot-static', name})
          }
          dataAttr && attrs.removeNamedItem(dataAttr.name)
          attrs.getNamedItem(':name') && attrs.removeNamedItem(':name') //不支持slot的name动态
        }//处理<slot/>节点

        const refAttr = attrs.getNamedItem(':ref')
        if(refAttr){
          const id = createId()
          bindRules.push({type:'ref', id, pid, sign, sameSign, expr:refAttr.value})
          attrs.removeNamedItem(refAttr.name)
          operation = 1
        }//处理 :ref

        let propAttrs = ([...attrs]).filter(t=>t.name.charAt(0) === ':')
        const modelAttr = propAttrs.find(t=>t.name.indexOf(':model') === 0) //一个节点的model绑定会有多个吗？
        propAttrs = propAttrs.filter(t=>t.name.indexOf(':model') !== 0)
        modelAttr && propAttrs.push(modelAttr) //model的处理在其它attr之后，因为 组件的model的绑定处理可能会用到它其它attr绑定的值
        propAttrs.forEach(attr=>{
          if(attr.value.trim() === '') return
          if(attr.name.indexOf(':model') === 0 && !Regulars.value.test(attr.value)){
            throwError(`:model只能绑定属性名称，不支持复杂运算！`,constructor.name,el)
          }
          let name, eventName
          if(attr.name.indexOf(':model.') === 0){
            name = 'model'
            eventName = attr.name.slice(7)
          }else{
            name = attr.name.slice(1)
            eventName = undefined
          }
          let exprs = attr.value.match(Regulars.attr)?.map(name=>name.slice(2,-1))                      
          let temp
          if(exprs){ // 以 ${属性名称} 的形式绑定
            temp = attr.value.replaceAll('\\','\\\\') //.slice(1,-1)
          }else{ // 直接绑定了 属性名称 或 表达式
            temp = attr.value
            exprs = [attr.value]
          }
          const humpName = (name.indexOf('-') > 0) ? toHump(name) : undefined
          const id = createId()
          const rule = {type:'attr', id, pid, sign, sameSign, name, humpName, eventName, expr:exprs[0], temp}     
          if(el.constructor === HTMLSelectElement && name === 'model'){
            modelRule = rule
          }else{
            bindRules.push(rule)
          }
          attrs.removeNamedItem(attr.name)
          operation = 1
        })//处理attr

        const eventAttrs = ([...attrs]).filter(t=>t.name.charAt(0) === '@')
        eventAttrs.forEach(attr=>{
          const name = attr.name.slice(1)
          const exprs = [attr.value]
          if(exprs[0].match(/^(\w+|\w+(\.\w+)+)$/)){//如果匹配一个单词(和.)，那么这个单词就是方法名
            exprs[0] = `${exprs[0]}($event)`
          }
          const id = createId()
          bindRules.push({type:'event', id, pid, sign, sameSign, name, expr:exprs[0]})
          attrs.removeNamedItem(attr.name)
          operation = 1
        })//处理 event

        if(el.children.length === 0 && el.textContent.trim() !== ''){
          if(HTMLStyleElement.prototype.isPrototypeOf(el)){//处理css
            const content = el.textContent.trim().replace(Regulars.ann,'') //去掉注释后的textContent
            let exprs = content.match(Regulars.css)
            if(exprs){
              let temp = content.replace(Regulars.css,(a,vari)=>{
                vari = vari.replaceAll('-','.')
                return `\${handles.getValueVsEmpty(${vari})}`
                // return `\${(${vari}) === null || (${vari}) === undefined ? \'\' : (${vari})}`
              })
              temp = `\`${temp}\``
              const id = createId()
              bindRules.push({type:'css', id, pid, sign, sameSign, temp})
              operation = 1
            }
          }else{//处理 文本内容
            const exprs = el.textContent.match(Regulars.text)?.map(name=>name.slice(2,-2))
            if(exprs){
              let temp
              if(Regulars.text_simple.test(el.textContent)){//简单{{this.属性名}}绑定
                temp = el.textContent.slice(2,-2)
              }else{//复杂绑定
                const textContent = el.textContent.replaceAll('\\',`\\\\`)//注意\
                temp = textContent.replace(Regulars.text,'\${handles.getValueVsEmpty($1)}')
                temp = `\`${temp}\``
              }                  
              const id = createId()
              bindRules.push({type:'text', id, pid, sign, sameSign, temp})
              operation = 1
            }
          }
        } //处理textContent或css

        if(!elseNode) index++ //注意：elseNode节点时，index不变；因为:if/:else-if/:else永远只会出现一个节点在页面上

        if(operation > 0){
          el.setAttribute('sign',sign)//为了调试
          indexMap.map[sign] = Object.freeze([...indexMap.indexs,index])
        }
        // if(elseNode){else-if/else节点不要加进indexMap，初始化createSignMap时会找不到它对应的el，只能找到:if的el
        //   indexMap.map[sign] = Object.freeze([...indexMap.indexs,ifIndex]) //else-if/else节点的index=if的index
        // }

        let childIndexMap
        if(jointNode.length > 0 || elseNode){ //开启一个新jointNode的indexMap
          childIndexMap = {map:{},indexs:[]}
          el[mapKey] = childIndexMap.map
        }else{
          childIndexMap = {map:indexMap.map,indexs:[...indexMap.indexs,index]}
        }
        curEachIds = eachIds.concat(curEachIds)
        parsingHtml({ parentEl:el, fragments, parentId: pid, eachIds:curEachIds, indexMap: childIndexMap })

        if(modelRule) bindRules.push(modelRule) //select元素的model绑定必须在它的option都设置完成后，否则值不正确；所以让:model作最后一个att处理。
        if(elseNode) elseNode.remove()
        if(jointNode.length > 0){
          fragments[sign] = el
          const jointEl = document.createElement('joint')
          jointEl.setAttribute('sign',sign) //为了调试
          jointEl.setAttribute('class',jointNode.join(' ')) //为了调试
          el.parentNode.replaceChild(jointEl,el)
        }
      })
      return fragments
    }
    
    const rootMap = {}
    const fragments = parsingHtml({parentEl:template,fragments:{},indexMap:{map:rootMap,indexs:[]}})
    for(let key in fragments) Object.freeze(fragments[key][mapKey])
    template[mapKey] = Object.freeze(rootMap)

    bindRules.forEach((rule,i)=>{
      rule.order = i + 1
      Object.freeze(rule)
    })

    const obj = {}
    templateDataCacheHelper.set(constructor,obj)
    obj.bindRules = Object.freeze(bindRules)
    obj.fragments = Object.freeze(fragments) //nodesMap不允许改动
    obj.template = template
    // Object.freeze(obj)
  }
  /**
   * @注意：因为是根据sign来更新，所以 文字不能跟element并列写，如：<div>文字xxx<span>文本yyyy</span></div>。
   */
  static #templateBinding(CustomSubHTMLElementConstructor){
    const tempData = templateDataCacheHelper.get(CustomSubHTMLElementConstructor)
    if(tempData.bindExecute) return tempData.bindExecute  //一种组件的模板绑定只需要解析一次
            
    const rules = tempData.bindRules

    const handles = ((tempData,rules)=>{
      const initSlots = function(){
        rules = rules.filter(t=>t.type === 'slot' || t.type === 'slot-static')
        if(rules.length === 0) return
        const slots = {}
        rules.forEach(({type,name,single})=>{
          if(type === 'slot-static'){
            slots[name] = null //注意：不是undefined
          }else{
            slots[name] = {
              single,
              items: []
            }
          }
        })
        this._setProp(slotsSymbol, slots)
      }//设置slots 响应属性
      const ifHandle = function(newIndex,oldIndex,args,fromTrigger){
        // effector.代理 已经比较了。 if(newIndex === oldIndex) return //索引一样,后面的代码无需执行、HTML无需改变
  
        const { scope, unique, rule, next, contextVars, forArgs } = args
  
        this.#removeEffectorWithOther({unique, includeSelf: false})//移除自身和所有子级effector；下面的代码会重新加回新的effector
  
        const sign = rule.sign
        const map = rule.sameSign ? scope : scope[mapKey]
        if(newIndex !== -1){
          const templateSign = rule.exprs[newIndex].sign
          const ifScope = signFinder.toElementBySign(map,sign,tempData,templateSign)
          next.call(this, contextVars, ifScope, unique, forArgs, newIndex)
        }else{
          signFinder.toCommentBySign(sign,map)
        }//@注意：为什么固定用rule.sign：因为当重新从上往下执行时，oldIndex必定是空，不会是上次执行的index，因为这是在不同的区域程序，不是上次的程序。
      }
      const forHandle = function(list,oldList,args,fromTrigger){
        // if(list === oldList) return //effector里面已经比较了，这行不需要 。作用：索引一样,后面的代码无需执行、HTML无需改变
  
        const { scope, unique, rule, next, contextVars, isSubEach, forArgs } = args
        const { sign, layer, vars } = rule
        
        this.#removeEffectorWithOther({unique, includeSelf: false})//fromTrigger=true：this.addEffector不会执行；fromTrigger=false：this.addEffector已经执行，for新的effector已经添加，所以这里不能再remove自己。只能remove子级。
  
        let nodes,indexs,curNodes
        if(layer > 1){//多重for除第一次外，不再需要scope，必需参数都在preKey里。
          nodes = forArgs.nodes
          indexs = forArgs.indexs
          curNodes = indexs.reduce((nodes,i)=>{
            const item = nodes[i]
            if(item.constructor !== Array){
              nodes[i] = [item]
            }
            return nodes[i]
          },nodes)
        }else{
          if(fromTrigger){
            nodes = forArgs.nodes
          }else{
            const map = rule.sameSign ? scope[mapKey].parent.deref() : scope[mapKey]
            nodes = map[sign] //nodes也可能已经是Array，如果上次执行过。
            if(nodes.constructor !== Array) {
              map[sign] = (nodes = [nodes])//@ Array保存到全局引用；这样，当重新从上往下执行时，还能查找到el.
            }
            args.forArgs = {nodes}
            delete args.scope //第一层(layer=1)for的scope是个大麻烦！！！当触发(fromTrigger=true)调用这个函数时，有时候scope已被删除了；不如使用args.forArgs = nodes
          }
          indexs = []
          curNodes = nodes
        }//获取nodes,curNodes,indexs
        
        {
          const length = list.length
          for(let i = curNodes.length; i > length; i--){
            if(i > 1 || isSubEach){
              clearByNodes(curNodes.pop())
            }else{
              signFinder.toCommentByNodes(curNodes)
            }
          }
        }//根据list.length移除多余的element
  
        const nexts = list.map((data,index)=>{
          let itemEl
          {
            if(index === 0){
              itemEl = signFinder.toElementByNodes(curNodes,tempData,sign)
            }else{
              itemEl = curNodes[index]
              if(!itemEl){
                itemEl = signFinder.appendForItem(curNodes,index,tempData,sign)
              }else{
                while(itemEl.constructor === Array){
                  itemEl = itemEl[0]
                }//itemEl有可能是数组，必须找到数组里的element
              }
            }
          }//创建el，要保证传递给后面代码(next)的scope是一个真实的el
          const itemUnique = [...unique,index.toString()] //`${unique}-${index}`
          const itemForArgs = {nodes,indexs:[...indexs,index]}
          //@问题：curNodes和传给下级for的itemEl是个冲突，可能子级for用curNodes清空了，但scope(itemEl)却是不变的
          return ()=>{
            let itemContextVars
            if(args.type !== 'for-slotTemplate'){
              itemContextVars = {...contextVars}
              itemContextVars[vars.item] = data
              if(vars.index) {
                itemContextVars[vars.index] = index
              }
            }else{
              itemContextVars = contextVars
            }
            next.call(this, itemContextVars, itemEl, itemUnique, itemForArgs, data, args)//最后2个参数data/args只适用于for-slotTemplate
          } //next是从“更新树”的上下文里来的，所以它内部的所有变量都来自“更新树”的上下文域
        })
        nexts.forEach(fn=>fn()) //多重for时，为了element的插入顺序正确，所以先执行完list再执行它的next
        
        //第一层(layer=1)for的scope是个麻烦！！！！下面注释掉的代码都无法解决，留做个提醒；最终用上面这行解决了：map[sign] = (nodes = [nodes])。
          // if(rule.sameSign){
          //     let firstEl = nodes[0]
          //     while(firstEl.constructor === Array){
          //         firstEl = firstEl[0]
          //     }
          //     if(args.scope !== firstEl){debugger
          //         args.scope = firstEl
          //     }
          // }
          // if(layer === 1 && rule.sameSign && args.scope !== firstEl){
          //     args.scope = firstEl           
          // }//args.scope已改变，移除旧的scope。
      }//@@@多重for+slot的实现要更健壮；sign映射由sign->el变为sign->[el]的实现 要优化。
      const subForHandle = function(contextVars, getChildren, scope, rule, eachRule, unique, forArgs, next){
        // if(!rule) return        
        const map = scope[mapKey]
        let subEl = rule.sameSign ? scope : map[rule.sign]
        if(!subEl || subEl.constructor === Comment) return
        let subForEl = subEl.children[0]
        if(!subForEl){
          subForEl = cloneFragment(tempData.fragments,eachRule.sign)
          subEl.appendChild(subForEl)
          signFinder.createSignMap(subForEl)
          map[eachRule.sign] = subForEl //虽然eachRule.sign跟scope的sign相同，但获取scope是根据rule.sameSign来的，所以不会冲突。
        }

        const { deep } = eachRule.vars
        if(deep){
          contextVars = {...contextVars,[deep]:contextVars[deep]+1}
        }
        
        this.addEffector(getChildren,{
          type: 'for-eachSub',
          fn: forHandle,
          scope: eachRule.sameSign ? subForEl : scope,
          unique,
          rule: eachRule,
          forArgs,
          contextVars,
          next,
          isSubEach: true,
        },{immediate:true})
      }
      const slotTemplateHandle = function(args){
        /**这个函数this.addEffector之前的操作太“不确定”了，找机会优化！
        原因在于：为了实现 多重for,sign的映射由 sign->el变成了sign->[el]，要想想怎么优化这个机制 
        */
        const { scope, unique, rule, contextVars, getDynamicName } = args
        const { sign, sameSign, name } = rule
  
        const el  = sameSign ? scope : scope[mapKey][sign]//@注意：第一次scope肯定是el，但下一次也可能是Arrary
        const parentEl = el.parentElement
  
        if(name.constructor === Object){
          this.addEffector(getDynamicName, {
            type: 'slotTemplate-name',
            unique: [...unique,'name'],
            parentEl,
            contextVars,
            preArgs: args,
            fn: _slotTemplate_name_next
          }, {immediate: true})
        }else{
          _slotTemplateHandle.call(this,args,parentEl,name,unique)
        }
      }
      const _slotTemplateHandle = function(args,parentEl,slotName,unique){
        const { scope, contextVars, forArgs, rule, next } = args

        if(!Component.prototype.isPrototypeOf(parentEl)){
          el.setAttribute('slot',slotName)
          next.call(this,contextVars,scope,unique,forArgs) //第三方组件，数据无法互动。
          return
        }

        const slots = parentEl._getProp(slotsSymbol)
        const slot = slots[slotName]

        if(slot === undefined || slot === null){
          next.call(this,contextVars,scope,unique,forArgs)//如果父组件没有对应的slot，允许后面的代码执行，只不过由于slot机制，后面的HTML是不会显示在屏幕的。
          return
        }

        this.addEffector(()=>(slot.items), {
          type: 'for-slotTemplate',
          fn: forHandle,
          scope,
          unique,
          forArgs,
          contextVars,
          preArgs: {args,slot,slotName,parentEl},
          rule,
          next: _slotTemplate_html_next
        },{immediate: true})
        //@注意：当slotTemaple的:slot的值改变时，slot.single的值如果发生变化，element绑定形式从列表切换到单个/从单个切换到列表，会出现问题（无法移除多余的el）；所以不管slot.single=true或false，一律用forHandle处理。
      }
      const _slotTemplate_name_next = function(newName,oldName,args,fromTrigger){
        const {unique,preArgs,parentEl} = args
        this.#removeEffectorWithOther({unique, includeSelf: false})
        const nextUnique = [...unique,'html']
        _slotTemplateHandle.call(this,preArgs,parentEl,newName,nextUnique)
      }
      const _slotTemplate_html_next = function(contextVars, scope, unique, forArgs, {getData, contextVars: parentContextVars, unique: slotBranchName}, allArgs){
        const el = scope
        const { preArgs: { args,slot,slotName,parentEl } } = allArgs
        const { rule, next } = args
        if(slot.single){
          el.setAttribute('slot',slotName)
          el.removeAttribute('origin-slot')
        }else{
          el.setAttribute('slot',slotBranchName.join('-'))
          el.setAttribute('origin-slot',slotName)
        }
        const data = getData ? getData.call(parentEl,parentContextVars) : undefined
        if(rule.decoVarNames){//如果:slot-data的值是解构的形式，那必须对它进行监听。
          this.addEffector(()=>data,{
            type: 'slotTemplateData',
            unique: [...unique,'data'],
            scope: el,
            contextVars,
            forArgs,
            preArgs: args,
            forArgs,
            fn: _slotTemplate_data_next
          },{immediate:true,deep:true})
        }else{
          let curContextVars = contextVars
          if(rule.data){
            curContextVars = {...contextVars}
            curContextVars[rule.data] = data
          }
          next.call(this,curContextVars,el,unique,forArgs)
        }
      }
      const _slotTemplate_data_next = function(data,oldData,allArgs){
        const { unique, contextVars, forArgs, scope, preArgs: args } = allArgs
        const { next, setDecoVarToContext } = args
        const curContextVars = {...contextVars}
        setDecoVarToContext(curContextVars,data)
        next.call(this,curContextVars,scope,unique,forArgs)
      }
      const slotHandle = function({scope,unique,rule,contextVars,getData}){
        const { name, sign, single, sameSign } = rule
        const el  = sameSign ? scope : scope[mapKey][sign]
        if(!single){
          el.setAttribute('name',unique.join('-'))//用随机数代替unique是不是更好？因为unique……
          el.setAttribute('origin-name',name)
        }
        const slots = this._getProp(slotsSymbol)
        slots[name].items.push({unique, getData, contextVars})
      }
      const propertyHandle = function(newValue,oldValue,args,fromTrigger){
        const { scope, rule } = args
  
        const el = rule.sameSign ? scope : scope[mapKey][rule.sign]
        updateElement(rule, el, newValue)
  
        if(!fromTrigger && rule.name === 'model'){
          const { getValue, setValue, contextVars } = args
          createModelBind.call(this,el,rule.eventName,getValue,setValue,contextVars)
        }
      }
      const eventHandle = function(scope,rule,listener,contextVars){
        const { name, sign, sameSign } = rule
        const el = sameSign ? scope : scope[mapKey][sign]
        // if(!el) return
        createEventHandle(name).call(this,el,listener,contextVars)
      }
      const refHandle = function(scope,rule,unique){
        const el = rule.sameSign ? scope : scope[mapKey][rule.sign]
        // if(!el) return
        const key = `$${rule.expr}`
        const target = this.#shadowRoot[key]
        if(target){
          if(target.constructor === Array){
            target.push(el)
          }else{
            this.#shadowRoot[key] = [target,el]
          }
        }else{
          this.#shadowRoot[key] = el //:ref设置为内部的，不允许外部使用
        }
        this.#reactor.refs.push({unique,key})
      }
      const errorHandle = function(e){
          if(e.message.includes(' is not defined')){
              // const _match = e.message.match(/(.+?) is not defined/)
              const message = `“${CustomSubHTMLElementConstructor.name}”的模板绑定错误：${e.message}`
              alert(message)
              console.error(message)
          }
          throw e
      }//@各种 错误 处理要细化写

      return Object.freeze({
        rules,
        initSlots,
        forHandle,
        subForHandle,
        ifHandle,
        slotTemplateHandle,
        slotHandle,
        propertyHandle,
        eventHandle,
        refHandle,
        errorHandle,

        toListFor,
        getValueVsEmpty
      })
    })(tempData,rules)

    function buildUpdateTreeCode({id = undefined, pid = undefined, preSign = '', codeBlocks, contextVars}){
      const _rules = id ? rules.filter(t=>t.id === id) : rules.filter(t=>t.pid === pid)
      const contextDeconCode = `{ ${[...contextVars].join(',')} }`
      const codes = _rules.map((rule)=>{
        const curContextVars = new Set([...contextVars])
        const {type,id,sign,name,vars,temp,expr,exprs,data} = rule
        const clearForArgsCode = rule.layer === 1 ? 'forArgs = undefined;' : ''
        if(type === 'event'){
          const handleObj = {name:`eventHandle_${id}`,code:`function($event,${contextDeconCode},reset){${expr}}`}
          codeBlocks.push(handleObj)

          return `/*${name}，${expr} */
          handles.eventHandle.call(this,scope,rule_${id},eventHandle_${id},contextVars);`
        }else if(type === 'ref'){
          return `/*${expr} */
          handles.refHandle.call(this,scope,rule_${id},unique);`
        }else if(['attr','text','css'].includes(type)){
          const getValueFnObj = {name:`getValue_${id}`,code:`function(${contextDeconCode}){
            /* ${type}，${name}，${temp} */
            return ${temp}
          }`}
          codeBlocks.push(getValueFnObj)
          if(name === 'model'){
            const setValueFnObj = {name:`setValue_${id}`,code:`function(value,${contextDeconCode}){
              /* ${type}，${name}，${temp} */
              return ${expr}=value
            }`}            
            codeBlocks.push(setValueFnObj)
          }
          return `/*${type}，${name}，${temp} */
            this.addEffector(getValue_${id},{
              type: 'prop',
              scope,
              unique: [...unique,'${id}'],
              rule: rule_${id},
              contextVars,
              ${name === 'model' ? `getValue: getValue_${id},` : ''}
              ${name === 'model' ? `setValue: setValue_${id},` : ''}
              fn: handles.propertyHandle
            },{immediate:true});
          `
        }else if(type === 'for'){
          const {list,item,index,deep} = vars
          curContextVars.add(item)
          index && curContextVars.add(index)
          deep && curContextVars.add(deep)

          const getterFnObj = {name:`getter_${id}`,code:`function(${contextDeconCode}){
            return handles.toListFor(${list})
          }`}
          codeBlocks.push(getterFnObj)

          const nextCode = buildUpdateTreeCode({pid: id, preSign: sign, codeBlocks, contextVars: curContextVars}) 
          const nextObj = {name:`next_${id}`,code:`function(contextVars,scope,unique,forArgs){
            /*${type}.next，${temp} */
            ${nextCode}
          }`}
          codeBlocks.push(nextObj)

          return `/*for，${temp} */
          ${clearForArgsCode}
          ${deep ? `contextVars = {...contextVars,${deep}:0};` : ''}
          this.addEffector(getter_${id},{
            type: 'for',
            fn: handles.forHandle,
            contextVars,
            scope,
            unique: [...unique,'${id}'],
            forArgs,
            rule: rule_${id},
            next: ${nextObj.name}
          },{immediate:true});`
        }else if(type === 'sub-for'){
          const getChildrenFnObj = {name:`getChildren_${id}`,code:`function(${contextDeconCode}){
            return handles.toListFor(${expr})
          }`}
          codeBlocks.push(getChildrenFnObj)

          const eachId = rule.eachId
          return `handles.subForHandle.call(this, contextVars, getChildren_${id}, scope, rule_${id}, rule_${eachId}, [...unique,'${id}'], forArgs, next_${eachId});`
        }else if(type === 'if'){
          const getterFnBodyCode =  exprs.map(({expr, mode},i)=>{
            if(mode === 'if') return `if(${expr}){return 0}`
            else if(mode === 'else-if') return `else if(${expr}){return ${i}}`
            else if(mode === 'else') return `else{return ${i}}`
          }).concat(['return -1']).join('\n')
          const getterFnObj = {name:`getter_${id}`,code:`function(${contextDeconCode}){${getterFnBodyCode}}`}
          codeBlocks.push(getterFnObj)

          const subFnBodys = exprs.map(({sign, id})=>{
            return buildUpdateTreeCode({pid: id, preSign: sign, codeBlocks, contextVars:curContextVars})
          })
          const subFnObjs = subFnBodys.map((code,i)=>({name:`sub_${id}_${i}`,code:`function(contextVars,scope,unique,forArgs){
            /*${exprs[i].mode}(${exprs[i].expr})*/
            ${code}
          }`}))
          subFnObjs.forEach(obj=>codeBlocks.push(obj))

          const nextObj = {name:`next_${id}`,code:`function(contextVars,scope,unique,forArgs,ifIndex){
            /*${exprs[0].mode}(${exprs[0].expr})*/
            ({
              ${subFnObjs.map((obj,i)=>(`${i}:sub_${id}_${i}`)).join(',')}
            })[ifIndex].call(this,contextVars,scope,unique,forArgs)
          }`}
          codeBlocks.push(nextObj)

          return `/*${exprs[0].mode}(${exprs[0].expr})*/
          this.addEffector(getter_${id},{
            type:'if',
            fn:handles.ifHandle,
            contextVars,
            forArgs,
            scope,
            unique: [...unique,'${id}'],
            rule: rule_${id},
            next: ${nextObj.name}
          },{immediate:true});`
        }else if(type === 'slotTemplate'){
          const getDynamicNameFnObj = {name:`getDynamicName_${id}`,code:`function(${contextDeconCode}){return ${name.expr}}`}
          codeBlocks.push(getDynamicNameFnObj)

          const { decoVarNames } = rule
          const annCode = `/*slotTemplate ${name.expr ? `:name="${name.expr}"` : `name="${name}"`} :slot-data="${data}" */`
          
          if(decoVarNames){
            decoVarNames.forEach(varName=>curContextVars.add(varName))
          }else{
            curContextVars.add(data)
          }
          
          const nextCode = buildUpdateTreeCode({pid: id, preSign:sign, codeBlocks, contextVars:curContextVars})
          const nextObj = {name:`next_${id}`,code:`function(contextVars,scope,unique,forArgs){
            ${annCode}            
            ${nextCode}
          }`}
          codeBlocks.push(nextObj)

          let setDecoVarToContext = 'undefined'
          if(decoVarNames){
            setDecoVarToContext = `setDecoVarToContext_${id}`
            const setDecoVarToContextFnObj = {name:setDecoVarToContext,code:`(contextVars,data)=>{
              const ${data} = data;
              ${decoVarNames.map(varName=>(`contextVars['${varName}'] = ${varName}`)).join('\r\n;')}
            }`}
            codeBlocks.push(setDecoVarToContextFnObj)
          }
          
          return`${annCode}
          ${clearForArgsCode}
          handles.slotTemplateHandle.call(this,{
            scope,
            unique: [...unique,'st@${id}'],
            forArgs,
            contextVars,
            rule: rule_${id},
            getDynamicName: getDynamicName_${id},
            setDecoVarToContext: ${setDecoVarToContext},
            next: ${nextObj.name}
          });`
        }else if(type === 'slot'){
          const getDataFnObj = {name:`getData_${id}`,code:`function(${contextDeconCode}){
            return ${data}
          }`}
          codeBlocks.push(getDataFnObj)

          return `/*<slot name="${name}" :slot-data="${data}"/> */
          handles.slotHandle.call(this,{
            scope, 
            unique: [...unique,'st@${id}'],
            rule: rule_${id}, 
            contextVars,
            getData: getData_${id}
          });`
        }//type==="slot-static" 不需要处理
      })
      
      return codes.filter(t=>t).join('\n')
    }

    const statementRuleCodes = rules.map((rule,i)=>{
      if(['elseif','slot-static'].includes(rule.type)){
        return undefined
      }else{
        return `/* ${rule.type} */ const rule_${rule.id} = handles.rules[${i}];`
      }
    }).filter(t=>t)
    
    const contextVars = new Set()
    const codeBlocks = []
    const entryCode = buildUpdateTreeCode({codeBlocks, contextVars})
    const entryCodeObj = {name:'entry',code:`function(contextVars,scope,unique){
      handles.initSlots.call(this);
      let forArgs = undefined;
      ${entryCode}
    }`}
    contextVars.clear()
    codeBlocks.push(entryCodeObj)
    /** handles/rule_xxx是“关键字”，组件不能用这几个名字作属性名，:for绑定更不能用它们.
     */
    const updateTreeFnBodyCode = codeBlocks.map(t=>`const ${t.name} = ${t.code}`).join('\r\n;')
    const updateTreeFn = Function('handles',`/* ${CustomSubHTMLElementConstructor.name} */
                  ${statementRuleCodes.join('\n')}
                  ${updateTreeFnBodyCode};
                  return entry
                `)
    const updateTreeFnEntry = updateTreeFn(handles)
    tempData.bindExecute = function(el,shadowRoot){
      const scope = signFinder.createSignMap(shadowRoot)
      el.map = scope //测试用，要删除
      console.time()
      updateTreeFnEntry.call(el,{},scope,[])//[]=unique,{}=contextVars
      console.timeEnd()
    }
    tempData.updateTreeFunction = updateTreeFn //调试用，要删
    console.log(CustomSubHTMLElementConstructor.name,tempData)
    return tempData.bindExecute
  }
  _getProp(name){
    return this.#reactor.obj[name]
  }
  _setProp(name,value,isSmashUpdate){
    if(isSmashUpdate){
      effector.isSmashUpdate = true
    }
    this.#reactor.obj[name] = value
    return true
  }    
  /**
   * 持久的effector
   * @param {*} getter 
   * @param {*} args 
   * @returns 
   */
  addEffector(getter,args,options){
    if(!args.type) args.type = 'data'
    if(!args.master) args.master = this
    effector.addMonitor(getter,args,options)

    if(args.type !== 'data' && args.targets.size){
      this.#reactor.tree.push(args)//如果是自己触发的，this.addEffector不会执行，所以tree里不会有重复的args.
    }

    return (options && options.remove) ? ()=>{
      this.#removeEffector([args])
      const index = this.#reactor.tree.indexOf(args)
      this.#reactor.tree.splice(index,1)
    } : undefined //移除函数
  }
  #removeEffectorWithOther({unique,includeSelf = true}){
    {
      const slots = this._getProp(slotsSymbol)
      if(slots){
        Object.entries(slots).filter(t=>t[1]).forEach(([name,obj])=>{
          const invalidItems = unique.reduce((items,part,i)=>(items.filter(item=>item.unique[i] === part)),obj.items)
          if(invalidItems.length > 0){
            obj.items = obj.items.filter(t=>!invalidItems.find(t2=>t2 === t))
          }
        })
      }
    }//移除对应的slot

    {
      const len = unique.length
      const list = unique.reduce((items,part,i)=>(items.filter(item=>item.unique[i] === part)),this.#reactor.refs)
      list.forEach(item=>{
        delete this.#shadowRoot[item.key]
        this.#reactor.refs.splice(this.#reactor.refs.indexOf(item),1)
      })
    }//移除对应的ref

    {
      let list = unique.reduce((tree,part,i)=>(tree.filter(args=>args.unique[i] === part)),this.#reactor.tree)
      if(!includeSelf){
        const length = unique.length
        list = list.filter(t=>t.unique.length > length)
      }
      if(list.length === 0) return

      this.#removeEffector(list)

      this.#reactor.tree = this.#reactor.tree.filter(t=>t.fn)//被移除的args已经被清理成空对象，不存在任何属性了。
    }//移除effector
  }
  #removeEffector(list){
    list.forEach(args=>{ //args.targets=Map,
      args.targets.forEach((keys, target) => {//keys=Set；target=obj
        keys.forEach(key=>{
          effector.removeMonitor({target,key,args})
        })
        keys.clear()
      })
      {
        if(args.targets) args.targets.clear()
        for(let key in args){ delete args[key] }
      }//清空args对象，便于浏览器回收
    })
  }
  nextTick(callback){
    effector.nextTick(callback)
  }
  emitEvent(name, detail, bubbles = true){
    this.dispatchEvent(new CustomEvent(name, {
      bubbles,
      detail
    }))
  }
  postMessage(name,data = undefined){
      this.globalExecute({name:'post',params:{name,data,source:this}})
      return this
  }
  addMessageListener(name,fun,source = undefined){
      this.globalExecute({name:'listener',params:{name,fun,source,master:this}})
      return this
  }
  addMessageListener2(name,fun,source = undefined){
      this.globalExecute({name:'listener',params:{name,fun,source,master:this}})
      return ()=>{
          this.globalExecute({name:'removeListener',params:{name,fun,source}})
      }
  }
  /**
   * 克隆；克隆的时候回执行constructor
   * @param {Boolean} deep 是否复制 子元素
   * @returns 
   */
  cloneNode(deep,extendedProps = undefined){
    return cloneComponent.call(this, deep, Component, extendedProps)
  }
}

export {
  Component,
  effector,
  componentReactObjMap
}

//#endregion
