// console.log('effector')
//#region 
const isObj = (obj)=>(typeof obj === 'object' && obj !== null)

 /**
 * 碎片化更新
 * @param {*} target 
 * @param {*} key 
 * @param {*} value 
 * @param {*} callback 
 * @returns 
 */
function smashUpdate(target,key,value,callback){
  const oldValue = target[key]
  if(Element.prototype.isPrototypeOf(value) || Element.prototype.isPrototypeOf(oldValue)){
      callback(target,key,value,oldValue)
      return
  } //Element不能用下面这样的赋值操作
  if(!isObj(oldValue) || !isObj(value)){
      if(oldValue !== value){                
          if(value && typeof(value) === 'object'){
              callback(target,key,JSON.parse(JSON.stringify(value)),oldValue)
          }else{
              callback(target,key,value,oldValue)
          }
      }
      return
  } //简单值
  const oldKeys = Reflect.ownKeys(oldValue)
  const newKeys = Reflect.ownKeys(value)
  oldKeys.forEach(key=>{
      if(newKeys.includes(key)){
          smashUpdate(oldValue, key, value[key], callback)
      }else{
          smashUpdate(oldValue, key, undefined, callback)
      }
  })
  newKeys.filter(key=>!oldKeys.includes(key)).forEach(key=>{
      callback(oldValue,key,value[key],undefined)
  })
}
function traverse(value, seen = new Set()) {
  if (typeof value !== 'object' || value === null || seen.has(value)){
    return value
  }//如果数据是原始值或者已经被读取过了，则什么都不做
  seen.add(value)//seen是防止 死循环。
  for (const key in value) {
    traverse(value[key], seen)
  }//堆对象内部地属性，递归地读取数据
  return value
}

const ArrayKeyRegular = /^([1-9]\d*|0)$/
const tempArgss = []

function echo(args,fromTrigger){ //fromTrigger!=true，表示是第一次触发
  const { master, contextVars, fn, _options } = args
  const { getter, oldValue, immediate, absol } = _options

  args.targets = new Map()

  tempArgss.push(args)
  const newValue = getter.call(master,contextVars)
  tempArgss.pop()
  
  if(args.type !== 'data' || newValue !== oldValue || (newValue !== null && typeof(newValue) === 'object')){
    if(fromTrigger || immediate){
      fn.call(args.master,newValue,oldValue,args,fromTrigger)
    }
    // _options.oldValue = newValue
    _options.oldValue = (absol && newValue && typeof(newValue) === 'object') ? JSON.parse(JSON.stringify(newValue)) : newValue
  }
  return newValue
}

class Effector{
  constructor(){}
  #proxiesMap = new WeakMap()
  #nextTimes = new Set()
  #unexecute_bind = []
  #unexecute_data = []
  #executPending = false
  argsMap = new WeakMap() // 以el为键，还是以object为键？最好…… // list = new WeakMap()
  setSize = 0 //统计，调试用
  isSmashUpdate = false //是否碎片化更新
  forceUpate = false //是否强制更新
  nextTick(callback){
    this.#nextTimes.add(callback)
    if(this.#unexecute_bind.length === 0 && this.#unexecute_data.length === 0){
      this.#executor([{}])
    } //executor里的finally至少执行一次以调用nextTimes
  }
  removeMonitor({target,key,args}){
    const keys = this.argsMap.get(target)
    if(!keys) return

    let items
    if(target.constructor === Array && (ArrayKeyRegular).test(key)){//这里的比较影响性能了，怎么改？
      key = 'length'
    }
    items = keys[key]
    if(items){
      items.delete(args)
      this.setSize--
    }
    if(items.size === 0){
      delete keys[key]
    }
    if(Reflect.ownKeys(keys).length === 0){
      this.argsMap.delete(target)
    }
  }
  addMonitor(originalGetter,args,options = {}){
    let oldValue
    let getter
    const { deep, immediate, absol } = options
    if (deep){
      getter = () =>traverse(originalGetter())
    }else{
      getter = originalGetter
    }

    args._options = { getter, oldValue, immediate, absol }
    echo.call(args.master,args)
    
    // const fn = args.fn
    // args.fn = (args_,fromTrigger)=>{ //fromTrigger!=true，表示时第一次触发
    //   args.targets = new Map()
    //   tempArgss.push(args)
    //   const newValue = getter()
    //   tempArgss.pop()      
    //   if(args.type !== 'data' || newValue !== oldValue || (newValue !== null && typeof(newValue) === 'object')){
    //     if(fromTrigger || immediate){
    //       fn.call(args.master,newValue,oldValue,args,fromTrigger)
    //     }
    //     oldValue = (absol && newValue && typeof(newValue) === 'object') ? JSON.parse(JSON.stringify(newValue)) : newValue
    //   }
    //   return newValue
    // }
    // args.fn.call(args.master,{args})
  }
  #track(target, key, result) {
    const args = tempArgss[tempArgss.length - 1]
    if(!args) return

    let kv = this.argsMap.get(target)
    if(!kv){
      this.argsMap.set(target,kv = {})
    }
    if(target.constructor === Array && (ArrayKeyRegular).test(key)){//这里的比较影响性能了，怎么改？
      key = 'length'
    }
    let items = kv[key]
    if(!items) items = kv[key] = new Set()
    
    items.add(args)
    this.setSize++

    {
      const targets = args.targets
      let keys = targets.get(target)
      if(!keys){
        targets.set(target,keys = new Set())
      }
      keys.add(key)      
    }

    if(result && result.constructor === Array){
      this.#track(result,'length')
    }//如果没有deep绑定，也能使Array的push/splice等可响应。        
  }
  #trigger(target, key, value, oldValue) { //Array遍历搜索慢
    let items = []
    let kv = this.argsMap.get(target)
    if(kv){
      items = kv[key]
      if(!items && target.constructor === Array && (ArrayKeyRegular).test(key)){
        items = kv['length']
      }
    }
    if(!items) return

    this.#executor(items,{target, key, value, oldValue})
  }
  /**
   * @注意：浏览器不允许Element被Proxy代理调用方法属性，否则报错。
   * @param {*} obj 
   * @returns 
   */
  createProxy(obj={}){ //被createProxy包装后的对象有两个特殊属性：_isProxy、v。
    const the = this
    if(!this.#proxiesMap.get(obj)){
      const _obj = new Proxy(obj,{ //真复杂杂杂杂杂杂！！！！！！要不要改？？？？？
        get(target,key){
          if(key === '_isProxy') return true
          if(key === 'v' && typeof(target) === 'object' && target !== null) return target //@注意：不再 跟踪
          let result,result2
          result = result2 = target[key]
          if(typeof(result) === 'function'){
            if(HTMLElement.prototype.isPrototypeOf(target)){
              return result.bind(target) //@注意：如果是HTMLElement，给它的方法bind target，而不是Proxy————Proxy(HTMLElement)调用HTMLElement的方法会报错，原因不明）
            }else{
              return result
            }
          }// function不监听也不proxy
          if(result === null || result === undefined){// 监听但不proxy
          }else if(typeof(result) === 'object'){                        
            result = result._isProxy ? result : the.createProxy(result)
          }
          the.#track(target, key, result2)
          return result
        },
        set(target,key,value){
          const oldValue = target[key]
          //const originValue = (value && value.hasOwnProperty(Symbol.toPrimitive)) ? value[Symbol.toPrimitive]() : value
          const originValue = (value && value._isProxy) ? value.v : value                   
          target[key] = originValue
          if(the.forceUpate || !(oldValue === originValue && (typeof(oldValue) !== 'object' || oldValue !== null))){
            if(the.isSmashUpdate){//碎片化更新，小心使用
              the.isSmashUpdate = false
              smashUpdate(target,key,originValue,(target, key, value, oldValue)=>{
                target[key] = value
                the.#trigger(target, key, value, oldValue)
              })
            }else{
              the.#trigger(target, key, originValue, oldValue)
            }                            
          }
          return true
        }
      })
      this.#proxiesMap.set(obj,_obj)
    }
    return this.#proxiesMap.get(obj)
  }
  /**
   * 合并、延迟执行effect
   * @param {*} list 
   * @param {*} values 
   * @returns 
   */
  #executor(items,values){//values={target, key, value, oldValue}，不过values没用到
    items.forEach(args=>{
      if(args.type === 'data'){
        if(!this.#unexecute_data.includes(args)){
          this.#unexecute_data.push(args)
        }
      }else{
        if(!this.#unexecute_bind.includes(args)){
          this.#unexecute_bind.push(args)
        }
      }
    })
    if(this.#executPending) return
    Promise.resolve().then(()=>{
      this.#executPending = false //设为false后，Reflect.apply(item.args.fn)触发的effector就又可以加进新的Promise进行等待执行。
      
      while(this.#unexecute_data.length){
        const args = this.#unexecute_data.pop() // pop比shift性能好
        // Reflect.apply(args.fn, null, [args,true])
        Reflect.apply(echo, null, [args,true])
      }//先执行完data响应

      if(this.#unexecute_bind.length === 0) return
      const unexecute = [...this.#unexecute_bind]
      this.#unexecute_bind = []
      unexecute.sort((a,b)=>b.unique.length - a.unique.length || b.rule?.order - a.rule?.order) //存在:each+:sub-each后，单用order排序就混乱了，必须加上unique的包含关系。type='data'先执行，然后按绑定的树关系从上往下执行。
      // unexecute.length > 1 && console.log(unexecute.map(t=>([t.unique.join('-'),t.type])))
      while(unexecute.length){
        const args = unexecute.pop() // pop比shift性能好
        //@要注意下面这2个continue：
        if(!args.fn) continue //return //已经被它的父级移除了 或 本来就是空的        
        const exist = args.unique.reduce((ary,part,i)=>(ary.filter(t=>t.master === args.master && t.unique[i] === part)),this.#unexecute_bind).length > 0
        if(exist) continue //新加入的 和 新加入的后代 不许在当前Promise执行(因为有的后代可能“不合格”了)，它们在下一个Promise执行。
        //错误，还要加上scope区别组件。 if(this.#unexecute_bind.find(t=>args.unique.indexOf(t.unique) === 0)) continue //新加入的 和 新加入的后代 不许在当前Promise执行(因为有的后代可能“不合格”了)，它们在下一个Promise执行。
        // console.log(args)
        Reflect.apply(echo, args.master, [args,true])
        // Reflect.apply(args.fn, args.master, [args,true])//要记得：这里执行后，可能又触发effector从而调用#executor加入#unexecute；那么Promise.resolve().then(()=>{}又再次执行
      }
    }).finally(()=>{
      if(this.#executPending) return //还有下一个Promise需要执行；#nextTimes留给最后一个Promise.finally执行。
      this.#nextTimes.forEach(fn=>fn())
      this.#nextTimes.clear()
    })
    this.#executPending = true
  }
}

export{
  Effector
}

//#endregion