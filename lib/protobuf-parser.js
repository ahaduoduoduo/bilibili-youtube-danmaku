// 简化的Protobuf解析器，用于解析B站弹幕数据
class ProtobufParser {
    constructor() {
        // 弹幕消息结构定义
        this.danmakuProto = {
            1: { name: 'elems', type: 'repeated', fieldType: 'DanmakuElem' }
        };
        
        this.danmakuElemProto = {
            1: { name: 'id', type: 'int64' },
            2: { name: 'progress', type: 'int32' },
            3: { name: 'mode', type: 'int32' },
            4: { name: 'fontsize', type: 'int32' },
            5: { name: 'color', type: 'uint32' },
            6: { name: 'midHash', type: 'string' },
            7: { name: 'content', type: 'string' },
            8: { name: 'ctime', type: 'int64' },
            9: { name: 'weight', type: 'int32' },
            10: { name: 'idStr', type: 'string' },
            11: { name: 'attr', type: 'int32' },
            12: { name: 'action', type: 'string' }
        };
    }
    
    // 解析变长整数
    parseVarint(buffer, offset) {
        let value = 0;
        let shift = 0;
        let byte;
        
        do {
            if (offset >= buffer.length) {
                throw new Error('Buffer overflow');
            }
            byte = buffer[offset++];
            value |= (byte & 0x7F) << shift;
            shift += 7;
        } while (byte & 0x80);
        
        return { value, offset };
    }
    
    // 解析字符串
    parseString(buffer, offset, length) {
        const decoder = new TextDecoder();
        const stringBytes = buffer.slice(offset, offset + length);
        return decoder.decode(stringBytes);
    }
    
    // 解析单个字段
    parseField(buffer, offset) {
        const { value: tag, offset: newOffset } = this.parseVarint(buffer, offset);
        const fieldNumber = tag >>> 3;
        const wireType = tag & 0x07;
        
        offset = newOffset;
        let fieldValue;
        
        switch (wireType) {
            case 0: // Varint
                const varint = this.parseVarint(buffer, offset);
                fieldValue = varint.value;
                offset = varint.offset;
                break;
                
            case 2: // Length-delimited
                const length = this.parseVarint(buffer, offset);
                offset = length.offset;
                fieldValue = buffer.slice(offset, offset + length.value);
                offset += length.value;
                break;
                
            default:
                throw new Error(`Unsupported wire type: ${wireType}`);
        }
        
        return { fieldNumber, fieldValue, offset };
    }
    
    // 解析弹幕元素
    parseDanmakuElem(buffer) {
        const elem = {};
        let offset = 0;
        
        while (offset < buffer.length) {
            try {
                const { fieldNumber, fieldValue, offset: newOffset } = this.parseField(buffer, offset);
                offset = newOffset;
                
                const fieldDef = this.danmakuElemProto[fieldNumber];
                if (!fieldDef) continue;
                
                switch (fieldDef.name) {
                    case 'content':
                    case 'midHash':
                    case 'idStr':
                    case 'action':
                        if (fieldValue && fieldValue.length > 0) {
                            elem[fieldDef.name] = this.parseString(fieldValue, 0, fieldValue.length);
                        } else {
                            elem[fieldDef.name] = '';
                        }
                        break;
                        
                    case 'progress':
                    case 'mode':
                    case 'fontsize':
                    case 'color':
                    case 'weight':
                    case 'attr':
                        elem[fieldDef.name] = (fieldValue !== undefined && fieldValue !== null) 
                            ? fieldValue 
                            : 0;
                        break;
                        
                    case 'id':
                    case 'ctime':
                        elem[fieldDef.name] = (fieldValue !== undefined && fieldValue !== null) 
                            ? fieldValue.toString() 
                            : '';
                        break;
                }
            } catch (e) {
                break;
            }
        }
        
        return elem;
    }
    
    // 解析完整的弹幕响应
    parseDanmakuResponse(buffer) {
        const danmakus = [];
        let offset = 0;
        const uint8Array = new Uint8Array(buffer);
        
        while (offset < uint8Array.length) {
            try {
                const { fieldNumber, fieldValue, offset: newOffset } = this.parseField(uint8Array, offset);
                offset = newOffset;
                
                if (fieldNumber === 1) { // elems field
                    const elem = this.parseDanmakuElem(fieldValue);
                    // 增强有效性检查
                    if (this.isValidDanmaku(elem)) {
                        danmakus.push(elem);
                    }
                }
            } catch (e) {
                break;
            }
        }
        
        return danmakus;
    }
    
    // 检查弹幕数据是否有效
    isValidDanmaku(elem) {
        return elem && 
               elem.content && 
               typeof elem.content === 'string' && 
               elem.content.trim().length > 0 &&
               typeof elem.progress === 'number' && 
               elem.progress >= 0 &&
               !isNaN(elem.progress);
    }
}

// 导出给background script使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProtobufParser;
}

// 在WXT环境中，将ProtobufParser设为全局变量
if (typeof globalThis !== 'undefined') {
    globalThis.ProtobufParser = ProtobufParser;
}