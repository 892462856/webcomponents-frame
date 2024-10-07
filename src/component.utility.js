//#region 

function addEventListenerWithCanceller(el,eventName, fn, isCapture){
  el.addEventListener(eventName, fn, isCapture)
  return ()=>{
    el.removeEventListener(eventName, fn, isCapture)
  }
}

function insertAfter(parentNode,newNode, referenceNode){
  //var insertedNode = parentNode.insertBefore(newNode, referenceNode);
  //nextSibling
  if(referenceNode.nextSibling){
    parentNode.insertBefore(newNode,referenceNode.nextSibling)
  }else{
    parentNode.appendChild(newNode)
  }
}

const toHump = (name)=>(name.replace(/-(\w)/g,(a,b)=>(b.toUpperCase())))

/**
 * 克隆Component组件的原型链属性的值，克隆时，会执行新el的constructor
 */
const cloneComponent = (function(){
  const propsMap = new Map()

  /**
   * 从原型链获取属性，并缓存
   * @param {HTMLElement} target 
   * @returns [Array,Array……]
   */
  function getPropsByPrototypes(target){
    target = Object.getPrototypeOf(target)
    const constr = target.constructor
    if(constr === HTMLElement) return undefined

    const props = propsMap.get(constr)
    if(props){
      return props
    }else{
      const selfProps = []

      const parentProps = getPropsByPrototypes(target)
      parentProps && selfProps.push(...parentProps)

      const props = Object.entries(Object.getOwnPropertyDescriptors(target)).filter(([name,obj])=>obj.get && obj.set).map(([name])=>name)
      selfProps.push(props)

      propsMap.set(constr,Object.freeze(selfProps))
      
      return selfProps
    }
  }

  function cloneProps(el,source,ComponentBaseClass,extendedProps = []){
    if(!ComponentBaseClass.prototype.isPrototypeOf(el)) return

    let props = getPropsByPrototypes(source)
    props = [...extendedProps,...props.flat(Infinity)]
    props = new Set(props)
    props.forEach(name=>{
      const value = source[name]
      el[name] = (value && typeof(value) === 'object') ? JSON.parse(JSON.stringify(value)) : value
    })

    const children = [...el.children]
    children.forEach((el2,i)=>{
      cloneProps(el2,source.children.item(i))
    })
  }

  return function clone(deep,ComponentBaseClass,extendedProps){
    const el = Node.prototype.cloneNode.call(this,deep)
    
    cloneProps(el,this,ComponentBaseClass,extendedProps)

    return el
  }
})()

const extractVarNamesByDeconstruct = (function(){
  function filtrationString(oldStr){
    const newStr = oldStr.replace(/('[^']*'|`[^`]*`)/gi,(s)=>{
      return 'string'
    })
    return oldStr !== newStr ? filtrationString(newStr) : newStr
  }//清除 字符串
  function extract(oldStr,items = []){
    const newStr = oldStr.replace(/\{[^}{]*\}/gi,(s)=>{
      s.slice(1,-1).split(',')
      .map(t=>t.split(/:|=/))
      .filter(t=>t[1] !== '@-!-#-$-%')
      .map(t=>t[0].trim())
      .forEach(t=>items.push(t))
      
      return '@-!-#-$-%'
    })
    if(oldStr !== newStr){
      extract(newStr,items)
    }
    return items
  }//提取 变量名
  return (decoStr)=>{
    decoStr = filtrationString(decoStr)
    return extract(decoStr)
  }
})() //自 解构表达式字符串 提取 变量名


//#endregion

export{
  cloneComponent,
  addEventListenerWithCanceller,
  insertAfter,
  toHump,
  extractVarNamesByDeconstruct
}